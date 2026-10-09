//! MCP 橋接程式：Claude Code 以 stdio 啟動它，它把工具呼叫經 named pipe 轉給使用者開著的
//! 雜誌編輯軟體。
//!
//! 不能讓 Claude Code 直接啟動主程式：single-instance 會讓第二個主程式立刻結束，而且文件狀態在
//! 主程式的前端。這支程式只處理 MCP 協定（rmcp）；工具清單內嵌自 `mcp-tools.json`（由前端的
//! 工具定義產生），App 沒開時 Claude Code 仍看得到工具，呼叫時才回「請先開啟 App」。
//!
//! stdout 是 MCP 的通道，**不可以 `println!`**；除錯訊息寫 stderr。

use magazine_editor_lib::mcp::{client, pipe_name, protocol::ToolRequest, protocol::ToolResponse};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation, ListToolsResult,
    PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer, ServerHandler, ServiceExt};
use serde_json::Value;

const TOOLS_JSON: &str = include_str!("../../mcp-tools.json");

const INSTRUCTIONS: &str = "操作使用者正在「雜誌編輯軟體」中開啟的文件（使用者的電腦上必須開著這個 App）。\
長度單位一律是 pt（1/72 inch），座標原點是頁面左上角，x / y 是物件外框（旋轉前）的左上角。\
先用 get_document 了解文件，再用 list_pages / list_elements 取得 id。";

fn load_tools() -> Vec<Tool> {
    // 內容由 vitest 產生並比對，壞掉只會是開發時的錯誤
    serde_json::from_str(TOOLS_JSON).expect("mcp-tools.json 格式錯誤")
}

struct Bridge {
    tools: Vec<Tool>,
    pipe: String,
}

impl ServerHandler for Bridge {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("magazine-editor", env!("CARGO_PKG_VERSION")).with_title("雜誌編輯軟體"))
            .with_instructions(INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tools.clone()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let args = request.arguments.map(Value::Object).unwrap_or_else(|| Value::Object(Default::default()));
        let call = ToolRequest { tool: request.name.into_owned(), args };
        // 工具失敗（含 App 沒開）是 AI 看得到、可以自己處理的結果，不是協定錯誤
        let result = match client::call(&self.pipe, &call).await {
            ToolResponse::Ok { data } => {
                let text = serde_json::to_string_pretty(&data).unwrap_or_else(|_| data.to_string());
                CallToolResult::success(vec![ContentBlock::text(text)])
            }
            ToolResponse::Error { error } => CallToolResult::error(vec![ContentBlock::text(error)]),
        };
        Ok(result.into())
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bridge = Bridge { tools: load_tools(), pipe: pipe_name() };
    let service = bridge.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embeds_every_tool_with_an_object_schema() {
        let tools = load_tools();
        assert!(!tools.is_empty());
        for tool in &tools {
            assert!(tool.description.as_deref().is_some_and(|text| !text.is_empty()), "{}", tool.name);
            assert_eq!(tool.input_schema.get("type"), Some(&Value::from("object")), "{}", tool.name);
            assert!(tool.title.is_some(), "{}", tool.name);
        }
        assert!(tools.iter().any(|tool| tool.name == "get_document"));
    }
}
