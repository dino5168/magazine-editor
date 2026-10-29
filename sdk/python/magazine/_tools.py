"""MCP tool methods, generated from `src-tauri/mcp-tools.json` by `scripts/generate.py`. Do not edit.

Parameter names are the MCP names (camelCase, e.g. `pageId`), the same Claude Code sees. Omitted
optional parameters are not sent; `None` is sent as JSON `null` (e.g. `shadow=None` removes it).
"""

# ruff: noqa: E501, N803

from __future__ import annotations

from typing import Any, Final, Literal


class _Unset:
    """Marks an optional parameter that was not given (so it is not sent)."""

    _instance: _Unset | None = None

    def __new__(cls) -> _Unset:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self) -> str:
        return "UNSET"


UNSET: Final = _Unset()


def _args(values: dict[str, Any]) -> dict[str, Any]:
    return {name: value for name, value in values.items() if value is not UNSET}


class ToolMethods:
    """One method per MCP tool; subclasses decide how a call is sent (`_call`)."""

    def _call(self, tool: str, args: dict[str, Any]) -> Any:
        raise NotImplementedError

    def get_document(self) -> Any:
        """文件摘要

        取得目前在雜誌編輯軟體中開啟的文件摘要：名稱、頁數、主頁數、紙張尺寸、邊界、是否有未存檔變更、使用者正在看的頁面。長度單位一律是 pt（1/72 inch），座標原點是頁面左上角。

        Returns:
            The tool's JSON result.
        """
        return self._call("get_document", _args({}))

    def list_pages(self) -> Any:
        """頁面清單

        列出所有頁面（依頁序，index 從 1 起算）與主頁：id、名稱、尺寸（pt）、背景色、套用的主頁、物件數。主頁是頁面共用的底層內容。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_pages", _args({}))

    def list_elements(
        self,
        *,
        pageId: str | _Unset = UNSET,
    ) -> Any:
        """物件清單

        列出一個頁面或主頁上的物件，由最底層到最上層：id、類型（text / shape / image / line）、位置與尺寸（pt，外框旋轉前的左上角；線條是點的外框）、旋轉角度、文字摘要（最多 80 字）。省略 pageId 時是使用者正在看的頁面。不含主頁帶來的物件與頁碼。

        Args:
            pageId: 頁面或主頁的 id（由 list_pages 取得）（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("list_elements", _args({"pageId": pageId}))

    def get_element(
        self,
        *,
        id: str,
    ) -> Any:
        """物件內容

        取得單一物件的完整欄位，以及它所在的頁面 id 與圖層位置（0 = 最底層）。頁面與主頁上的物件都找得到。線條的 points 是相對於 x / y 的座標，另外附 pagePoints（頁面座標，和 add_line / update_element 的 points 同一套）。圖片框（圖形的 image）另外附 photoItem：照片是素材庫的哪一張（id、名稱；素材庫已沒有時為 null）。

        Args:
            id: 物件 id（由 list_elements 取得）

        Returns:
            The tool's JSON result.
        """
        return self._call("get_element", _args({"id": id}))

    def list_commands(self) -> Any:
        """選單指令清單

        列出 App 選單列上的所有指令：id、名稱、在選單中的位置、快捷鍵、勾選項目（視圖、工具面板）目前是否勾選、能不能執行（不能時附原因，例如尚未實作）。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_commands", _args({}))

    def run_command(
        self,
        *,
        id: Literal["file.new", "file.open", "file.save", "file.saveAs", "file.importImage", "file.importPages", "file.exportPng", "file.exportJpeg", "file.exportPdf", "file.exportFlipbook", "file.exportFlipbookZip", "file.exportPptx", "file.exportEpub", "project.library", "project.templates", "view.rulers", "view.grid", "view.contentGuides", "view.margins", "view.snap", "settings.pageSetup", "settings.pageNumbers", "settings.swatches", "settings.fonts", "settings.grid", "settings.mcp", "settings.themeLight", "settings.themeDark", "settings.themeSystem", "panel.templates", "panel.text", "panel.elements", "panel.upload", "panel.background", "panel.draw", "panel.properties", "panel.styles", "panel.pages", "panel.layers", "panel.resetLayout"],
    ) -> Any:
        """執行選單指令

        執行一個選單指令，效果和使用者點選單相同（例如 file.save 儲存、view.grid 切換格線、panel.layers 開關圖層面板）。勾選項目會切換並回傳切換後的狀態。會開對話框的指令（開啟、另存、匯出、設定…）只負責打開對話框，由使用者在 App 裡完成，工具不等待結果。不能執行的指令（尚未實作）回傳錯誤、不做任何事。先用 list_commands 查看。

        Args:
            id: 指令 id（由 list_commands 取得）

        Returns:
            The tool's JSON result.
        """
        return self._call("run_command", _args({"id": id}))

    def add_text(
        self,
        *,
        text: str,
        x: float,
        y: float,
        pageId: str | _Unset = UNSET,
        style: str | _Unset = UNSET,
        width: float | _Unset = UNSET,
        rotation: float | _Unset = UNSET,
        fontSize: float | _Unset = UNSET,
        font: str | _Unset = UNSET,
        bold: bool | _Unset = UNSET,
        italic: bool | _Unset = UNSET,
        underline: bool | _Unset = UNSET,
        strikethrough: bool | _Unset = UNSET,
        align: Literal["left", "center", "right", "distributed"] | _Unset = UNSET,
        textColor: str | dict[str, Any] | _Unset = UNSET,
        shadow: dict[str, Any] | None | _Unset = UNSET,
        lineHeight: float | _Unset = UNSET,
        letterSpacing: float | _Unset = UNSET,
        indentLeft: float | _Unset = UNSET,
        indentRight: float | _Unset = UNSET,
        indentFirstLine: float | _Unset = UNSET,
    ) -> Any:
        """新增文字

        在頁面加一個文字物件（放在最上層），回傳新物件的 id。x / y 是文字框左上角（pt），width 是換行寬度（預設 280），高度跟著文字。省略 pageId = 使用者正在看的頁面；指定別頁不會切換使用者的畫面。沒有 style 時的預設：黑體 11 pt、靠左、#171717，不連到樣式。style：連到文字樣式（名稱或 id），文字先取樣式的值，再套用這次給的樣式欄位（和樣式不同的欄位就是覆寫；之後改樣式時覆寫的欄位不跟著變）。文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。顏色參數（textColor、shadow.color、fill、stroke.color）可以是 hex，也可以是 { swatch: 色票名稱或 id, opacity?: 0–1 } 連到文件色票（list_swatches）：連到色票的顏色會在改色票時跟著變。 一次呼叫 = 一筆復原紀錄。

        Args:
            text: 文字內容，\\n 換行
            x:
            y:
            pageId: 頁面或主頁的 id（由 list_pages 取得）（可省略）
            style: 文字樣式的名稱或 id（由 list_text_styles 取得）（可省略）
            width: 換行寬度（pt），預設 280（可省略）
            rotation: 旋轉角度（度，順時針，繞外框左上角）（可省略）
            fontSize: 字級（pt）（可省略）
            font: 字型：內建的 黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱或 id（由 list_fonts 取得）（可省略）
            bold: （可省略）
            italic: （可省略）
            underline: （可省略）
            strikethrough: （可省略）
            align: （可省略）
            textColor: 文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票（可省略）
            shadow: 文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影（可省略）
            lineHeight: 行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5（可省略）
            letterSpacing: 字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0（可省略）
            indentLeft: 左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0（可省略）
            indentRight: 右縮排：每一行離文字框右緣的距離（字）；預設 0（可省略）
            indentFirstLine: 首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_text", _args({"text": text, "x": x, "y": y, "pageId": pageId, "style": style, "width": width, "rotation": rotation, "fontSize": fontSize, "font": font, "bold": bold, "italic": italic, "underline": underline, "strikethrough": strikethrough, "align": align, "textColor": textColor, "shadow": shadow, "lineHeight": lineHeight, "letterSpacing": letterSpacing, "indentLeft": indentLeft, "indentRight": indentRight, "indentFirstLine": indentFirstLine}))

    def add_shape(
        self,
        *,
        shape: Literal["rect", "roundedRect", "ellipse", "triangle", "star", "rhombus", "parallelogram", "trapezoid", "hexagon", "octagon", "cross", "heart", "cloud", "process", "document", "card", "note", "cylinder", "cube", "internalStorage", "tape", "delay", "dataStorage", "step", "pentagonArrow", "arrowRight", "arrowDouble", "arrowSplit", "callout", "calloutRound", "ribbon", "tag", "banner"],
        x: float,
        y: float,
        width: float,
        height: float,
        pageId: str | _Unset = UNSET,
        image: dict[str, Any] | _Unset = UNSET,
        params: dict[str, Any] | _Unset = UNSET,
        rotation: float | _Unset = UNSET,
        fill: str | dict[str, Any] | _Unset = UNSET,
        stroke: dict[str, Any] | None | _Unset = UNSET,
        text: str | _Unset = UNSET,
        style: str | _Unset = UNSET,
        verticalAlign: Literal["top", "middle", "bottom"] | _Unset = UNSET,
        fontSize: float | _Unset = UNSET,
        font: str | _Unset = UNSET,
        bold: bool | _Unset = UNSET,
        italic: bool | _Unset = UNSET,
        underline: bool | _Unset = UNSET,
        strikethrough: bool | _Unset = UNSET,
        align: Literal["left", "center", "right", "distributed"] | _Unset = UNSET,
        textColor: str | dict[str, Any] | _Unset = UNSET,
        shadow: dict[str, Any] | None | _Unset = UNSET,
        lineHeight: float | _Unset = UNSET,
        letterSpacing: float | _Unset = UNSET,
        indentLeft: float | _Unset = UNSET,
        indentRight: float | _Unset = UNSET,
        indentFirstLine: float | _Unset = UNSET,
    ) -> Any:
        """新增圖形

        在頁面加一個圖形（放在最上層），回傳新物件的 id。shape：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形，或圖形庫的圖形（六角形、雲、圓柱、箭頭、對話框…共 28 種，id 與參數用 list_shapes 查）；圖形撐滿 x / y / width / height 指定的外框（pt）。params 是圖形庫圖形的參數（只有圖形庫的圖形能給）。預設填色 #64748b、沒有邊框。text 是圖形內的文字（預設置中、垂直置中），它的樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。 style 讓圖形內文字連到文字樣式（需要同時給 text）。image 把素材庫的圖片放進圖形（圖片框；item 必填）。顏色參數（textColor、shadow.color、fill、stroke.color）可以是 hex，也可以是 { swatch: 色票名稱或 id, opacity?: 0–1 } 連到文件色票（list_swatches）：連到色票的顏色會在改色票時跟著變。省略 pageId = 使用者正在看的頁面。一次呼叫 = 一筆復原紀錄。

        Args:
            shape: 圖形：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形，或圖形庫的 id（hexagon、cloud、cylinder…；名稱與參數見 list_shapes）
            x:
            y:
            width:
            height:
            pageId: 頁面或主頁的 id（由 list_pages 取得）（可省略）
            image: 圖片框：把素材庫的圖片裁在圖形的外形裡（畫在填色之上、邊框與文字之下）（可省略）
            params: 圖形庫圖形的參數（名稱 → 值，見 list_shapes）：ratio 參數是 0–1 的比例、pt 參數是 pt；省略的參數用預設值，超出範圍時夾回（可省略）
            rotation: 旋轉角度（度，順時針，繞外框左上角）（可省略）
            fill: 填色：#rrggbb / #rrggbbaa（#00000000 = 透明），或 { swatch, opacity? } 連到文件色票（可省略）
            stroke: 邊框；null = 沒有邊框（可省略）
            text: 圖形內的文字，\\n 換行（可省略）
            style: 文字樣式的名稱或 id（由 list_text_styles 取得）（可省略）
            verticalAlign: 圖形內文字的垂直對齊（可省略）
            fontSize: 字級（pt）（可省略）
            font: 字型：內建的 黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱或 id（由 list_fonts 取得）（可省略）
            bold: （可省略）
            italic: （可省略）
            underline: （可省略）
            strikethrough: （可省略）
            align: （可省略）
            textColor: 文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票（可省略）
            shadow: 文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影（可省略）
            lineHeight: 行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5（可省略）
            letterSpacing: 字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0（可省略）
            indentLeft: 左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0（可省略）
            indentRight: 右縮排：每一行離文字框右緣的距離（字）；預設 0（可省略）
            indentFirstLine: 首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_shape", _args({"shape": shape, "x": x, "y": y, "width": width, "height": height, "pageId": pageId, "image": image, "params": params, "rotation": rotation, "fill": fill, "stroke": stroke, "text": text, "style": style, "verticalAlign": verticalAlign, "fontSize": fontSize, "font": font, "bold": bold, "italic": italic, "underline": underline, "strikethrough": strikethrough, "align": align, "textColor": textColor, "shadow": shadow, "lineHeight": lineHeight, "letterSpacing": letterSpacing, "indentLeft": indentLeft, "indentRight": indentRight, "indentFirstLine": indentFirstLine}))

    def add_line(
        self,
        *,
        points: list[dict[str, Any]],
        pageId: str | _Unset = UNSET,
        path: Literal["straight", "smooth"] | _Unset = UNSET,
        compound: Literal["single", "double"] | _Unset = UNSET,
        color: str | dict[str, Any] | _Unset = UNSET,
        width: float | _Unset = UNSET,
        dash: Literal["solid", "dashed", "dotted", "dashDot"] | _Unset = UNSET,
        start: dict[str, Any] | _Unset = UNSET,
        end: dict[str, Any] | _Unset = UNSET,
    ) -> Any:
        """新增線條

        在頁面加一條線條或箭頭（放在最上層），回傳新物件的 id。points 是頁面座標（pt），2 點 = 直線，更多 = 折線；path: "smooth" = 穿過每個點的平滑曲線。start / end 是第一點 / 最後一點那一端的箭頭（預設都沒有）。預設線條：1 pt 實線、#171717（文件有內建「文字」色票時連到它，同使用者用線條工具畫的線）。compound: "double" = 雙線（只給 straight）。水平的分隔線：兩點同 y，要橫跨內容區就用 get_document 的邊界算 x。顏色參數（textColor、shadow.color、fill、stroke.color）可以是 hex，也可以是 { swatch: 色票名稱或 id, opacity?: 0–1 } 連到文件色票（list_swatches）：連到色票的顏色會在改色票時跟著變。省略 pageId = 使用者正在看的頁面。一次呼叫 = 一筆復原紀錄。

        Args:
            points: 線條的點（頁面座標 pt），2–500 個，依序連起來
            pageId: 頁面或主頁的 id（由 list_pages 取得）（可省略）
            path: straight = 點與點之間連直線（2 點 = 直線，更多 = 折線）；smooth = 穿過每個點的平滑曲線（可省略）
            compound: double = 雙線（兩條細線各 1/3 線寬、中間留空；只給 straight）（可省略）
            color: 線條顏色：hex，或 { swatch, opacity? } 連到文件色票（可省略）
            width: 線寬（pt），預設 1（可省略）
            dash: solid 實線、dashed 虛線、dotted 點線、dashDot 點劃線（可省略）
            start: 這一端的箭頭；箭頭永遠是實線，尖端在端點上（可省略）
            end: 這一端的箭頭；箭頭永遠是實線，尖端在端點上（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_line", _args({"points": points, "pageId": pageId, "path": path, "compound": compound, "color": color, "width": width, "dash": dash, "start": start, "end": end}))

    def update_element(
        self,
        *,
        id: str,
        x: float | _Unset = UNSET,
        y: float | _Unset = UNSET,
        width: float | _Unset = UNSET,
        height: float | _Unset = UNSET,
        rotation: float | _Unset = UNSET,
        text: str | _Unset = UNSET,
        fill: str | dict[str, Any] | _Unset = UNSET,
        stroke: dict[str, Any] | None | _Unset = UNSET,
        cornerRadius: float | list[Any] | _Unset = UNSET,
        shape: Literal["rect", "roundedRect", "ellipse", "triangle", "star", "rhombus", "parallelogram", "trapezoid", "hexagon", "octagon", "cross", "heart", "cloud", "process", "document", "card", "note", "cylinder", "cube", "internalStorage", "tape", "delay", "dataStorage", "step", "pentagonArrow", "arrowRight", "arrowDouble", "arrowSplit", "callout", "calloutRound", "ribbon", "tag", "banner"] | _Unset = UNSET,
        params: dict[str, Any] | _Unset = UNSET,
        image: dict[str, Any] | None | _Unset = UNSET,
        verticalAlign: Literal["top", "middle", "bottom"] | _Unset = UNSET,
        points: list[dict[str, Any]] | _Unset = UNSET,
        path: Literal["straight", "smooth"] | _Unset = UNSET,
        compound: Literal["single", "double"] | _Unset = UNSET,
        start: dict[str, Any] | _Unset = UNSET,
        end: dict[str, Any] | _Unset = UNSET,
        fontSize: float | _Unset = UNSET,
        font: str | _Unset = UNSET,
        bold: bool | _Unset = UNSET,
        italic: bool | _Unset = UNSET,
        underline: bool | _Unset = UNSET,
        strikethrough: bool | _Unset = UNSET,
        align: Literal["left", "center", "right", "distributed"] | _Unset = UNSET,
        textColor: str | dict[str, Any] | _Unset = UNSET,
        shadow: dict[str, Any] | None | _Unset = UNSET,
        lineHeight: float | _Unset = UNSET,
        letterSpacing: float | _Unset = UNSET,
        indentLeft: float | _Unset = UNSET,
        indentRight: float | _Unset = UNSET,
        indentFirstLine: float | _Unset = UNSET,
    ) -> Any:
        """修改物件

        修改一個物件（頁面或主頁上的都可以，用 id 找），只改有給的欄位，回傳是否有變更。位置與尺寸：x、y、width、height（文字物件沒有 height）、rotation。文字物件：text 與文字樣式。圖形：fill、stroke、cornerRadius（只有矩形）、shape（換成另一個圖形，位置、大小、樣式、文字不變，參數用新圖形的預設）、params（圖形庫圖形的參數，只改有給的）、text（圖形內文字，空字串 = 移除）、verticalAlign 與文字樣式（套用在圖形內文字）、image（圖片框的照片：給 item 換照片、只給 fit / focusX / focusY / zoom 調整目前的照片、null = 移除照片）。圖片只能改位置與尺寸。線條：x、y、rotation（整條移動 / 轉）、points（換掉所有點，頁面座標；不能同時給 x / y）、path、compound、stroke（不能是 null）、start、end（箭頭；scale 省略時保留原本的大小）。文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。顏色參數（textColor、shadow.color、fill、stroke.color）可以是 hex，也可以是 { swatch: 色票名稱或 id, opacity?: 0–1 } 連到文件色票（list_swatches）：連到色票的顏色會在改色票時跟著變。 給了不屬於該物件類型的欄位會回錯誤、不做修改。一次呼叫 = 一筆復原紀錄。

        Args:
            id: 物件 id（由 list_elements 取得）
            x: （可省略）
            y: （可省略）
            width: （可省略）
            height: （可省略）
            rotation: 旋轉角度（度，順時針，繞外框左上角）（可省略）
            text: 文字內容；圖形的空字串 = 移除圖形內文字（可省略）
            fill: 圖形填色：hex，或 { swatch, opacity? } 連到文件色票（可省略）
            stroke: 邊框；null = 沒有邊框（可省略）
            cornerRadius: 矩形圓角（pt）：一個數字 = 四個角一樣；四個數字 = [左上, 右上, 右下, 左下] 分別設定。每個角超過短邊一半時取一半（可省略）
            shape: 圖形：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形，或圖形庫的 id（hexagon、cloud、cylinder…；名稱與參數見 list_shapes）（可省略）
            params: 圖形庫圖形的參數（名稱 → 值，見 list_shapes）：ratio 參數是 0–1 的比例、pt 參數是 pt；省略的參數用預設值，超出範圍時夾回（可省略）
            image: （可省略）
            verticalAlign: 圖形內文字的垂直對齊（可省略）
            points: 線條的點（頁面座標 pt），2–500 個，依序連起來（可省略）
            path: straight = 點與點之間連直線（2 點 = 直線，更多 = 折線）；smooth = 穿過每個點的平滑曲線（可省略）
            compound: double = 雙線（兩條細線各 1/3 線寬、中間留空；只給 straight）（可省略）
            start: 這一端的箭頭；箭頭永遠是實線，尖端在端點上（可省略）
            end: 這一端的箭頭；箭頭永遠是實線，尖端在端點上（可省略）
            fontSize: 字級（pt）（可省略）
            font: 字型：內建的 黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱或 id（由 list_fonts 取得）（可省略）
            bold: （可省略）
            italic: （可省略）
            underline: （可省略）
            strikethrough: （可省略）
            align: （可省略）
            textColor: 文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票（可省略）
            shadow: 文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影（可省略）
            lineHeight: 行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5（可省略）
            letterSpacing: 字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0（可省略）
            indentLeft: 左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0（可省略）
            indentRight: 右縮排：每一行離文字框右緣的距離（字）；預設 0（可省略）
            indentFirstLine: 首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("update_element", _args({"id": id, "x": x, "y": y, "width": width, "height": height, "rotation": rotation, "text": text, "fill": fill, "stroke": stroke, "cornerRadius": cornerRadius, "shape": shape, "params": params, "image": image, "verticalAlign": verticalAlign, "points": points, "path": path, "compound": compound, "start": start, "end": end, "fontSize": fontSize, "font": font, "bold": bold, "italic": italic, "underline": underline, "strikethrough": strikethrough, "align": align, "textColor": textColor, "shadow": shadow, "lineHeight": lineHeight, "letterSpacing": letterSpacing, "indentLeft": indentLeft, "indentRight": indentRight, "indentFirstLine": indentFirstLine}))

    def delete_elements(
        self,
        *,
        ids: list[str],
    ) -> Any:
        """刪除物件

        刪除同一頁（或同一主頁）上的一個或多個物件，回傳刪除的數量。一次呼叫 = 一筆復原紀錄，使用者可以 Ctrl+Z 或呼叫 undo 復原。

        Args:
            ids:

        Returns:
            The tool's JSON result.
        """
        return self._call("delete_elements", _args({"ids": ids}))

    def add_page(
        self,
        *,
        count: int | _Unset = UNSET,
        pageNumber: int | _Unset = UNSET,
        side: Literal["before", "after"] | _Unset = UNSET,
        masterId: str | None | _Unset = UNSET,
    ) -> Any:
        """新增頁面

        新增空白頁面，回傳新頁面的 id，並切到第一個新頁面（和使用者在 App 裡新增頁面相同）。省略的欄位用 App 的預設：加在最後一頁之後、1 頁、套用最後一頁的主頁（沒有就不套用）。新頁面的尺寸和插入處旁邊的頁面相同，背景用主頁的背景。一次呼叫 = 一筆復原紀錄。

        Args:
            count: 頁數，1–100（可省略）
            pageNumber: 插在第幾頁的前面或後面（1 起算），預設最後一頁（可省略）
            side: 插在 pageNumber 那一頁之前或之後，預設 after（可省略）
            masterId: 套用的主頁 id；null = 不套用（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_page", _args({"count": count, "pageNumber": pageNumber, "side": side, "masterId": masterId}))

    def add_master(
        self,
        *,
        name: str | _Unset = UNSET,
        parentId: str | None | _Unset = UNSET,
        background: str | dict[str, Any] | _Unset = UNSET,
    ) -> Any:
        """新增主頁

        新增一個空白主頁，回傳新主頁的 id 與名稱，並切到編輯這個主頁（和使用者在 App 裡新增主頁相同）。主頁放每一頁都要有的內容：之後用 add_text / add_shape 指定 pageId = 主頁 id 加內容，用 add_page 的 masterId 讓新頁面套用它。省略的欄位用 App 的預設：名稱 Master A、B…（第一個沒用過的）；正在編輯某個主頁時以它為基礎，否則不以任何主頁為基礎；背景 #ffffff。尺寸和使用者正在看的頁面相同。名稱最多 50 字；以主頁為基礎時，一條鏈最多 8 層、不能循環。一次呼叫 = 一筆復原紀錄。

        Args:
            name: 主頁名稱（可省略）
            parentId: 以哪個主頁為基礎（先畫那個主頁的內容）；null = 不以任何主頁為基礎（可省略）
            background: 主頁背景：#rrggbb 或 { swatch } 連到文件色票；只在編輯主頁時看到，也是之後套用它的新頁面的預設背景（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_master", _args({"name": name, "parentId": parentId, "background": background}))

    def set_page_master(
        self,
        *,
        pageIds: list[str],
        masterId: str | None,
    ) -> Any:
        """頁面套用主頁

        讓一個或多個頁面套用某個主頁（主頁的內容畫在頁面物件之下），或取消套用（masterId = null）。只能指定頁面，不能指定主頁（主頁以誰為基礎是另一回事）。頁面的背景不變。不會切換使用者的畫面。已經套用該主頁的頁面不變；回傳 changed 表示有沒有任何頁面改變。一次呼叫 = 一筆復原紀錄。

        Args:
            pageIds: 頁面 id（由 list_pages 的 pages 取得）
            masterId: 主頁 id（由 list_pages 的 masters 取得）；null = 取消套用

        Returns:
            The tool's JSON result.
        """
        return self._call("set_page_master", _args({"pageIds": pageIds, "masterId": masterId}))

    def list_text_styles(self) -> Any:
        """文字樣式清單

        列出文件的文字樣式（樣式表）：id、名稱、樣式欄位（同 add_text 的 font / fontSize / bold / italic / underline / strikethrough / align / textColor / shadow / lineHeight / letterSpacing）與連到它的文字數（文字物件與圖形內文字，含主頁）。文字連到樣式後，改樣式時沒被覆寫的欄位會跟著變。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_text_styles", _args({}))

    def add_text_style(
        self,
        *,
        name: str,
        fontSize: float | _Unset = UNSET,
        font: str | _Unset = UNSET,
        bold: bool | _Unset = UNSET,
        italic: bool | _Unset = UNSET,
        underline: bool | _Unset = UNSET,
        strikethrough: bool | _Unset = UNSET,
        align: Literal["left", "center", "right", "distributed"] | _Unset = UNSET,
        textColor: str | dict[str, Any] | _Unset = UNSET,
        shadow: dict[str, Any] | None | _Unset = UNSET,
        lineHeight: float | _Unset = UNSET,
        letterSpacing: float | _Unset = UNSET,
        indentLeft: float | _Unset = UNSET,
        indentRight: float | _Unset = UNSET,
        indentFirstLine: float | _Unset = UNSET,
    ) -> Any:
        """新增文字樣式

        在樣式表新增一個文字樣式，回傳 id。名稱必填（最多 50 字、不可和其他樣式同名）；省略的欄位用內建「內文」的值（黑體 11 pt、靠左、#171717）。文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。 新增後可以用 apply_text_style 或 add_text 的 style 讓文字連到它。一次呼叫 = 一筆復原紀錄。

        Args:
            name: 樣式名稱
            fontSize: 字級（pt）（可省略）
            font: 字型：內建的 黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱或 id（由 list_fonts 取得）（可省略）
            bold: （可省略）
            italic: （可省略）
            underline: （可省略）
            strikethrough: （可省略）
            align: （可省略）
            textColor: 文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票（可省略）
            shadow: 文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影（可省略）
            lineHeight: 行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5（可省略）
            letterSpacing: 字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0（可省略）
            indentLeft: 左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0（可省略）
            indentRight: 右縮排：每一行離文字框右緣的距離（字）；預設 0（可省略）
            indentFirstLine: 首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_text_style", _args({"name": name, "fontSize": fontSize, "font": font, "bold": bold, "italic": italic, "underline": underline, "strikethrough": strikethrough, "align": align, "textColor": textColor, "shadow": shadow, "lineHeight": lineHeight, "letterSpacing": letterSpacing, "indentLeft": indentLeft, "indentRight": indentRight, "indentFirstLine": indentFirstLine}))

    def update_text_style(
        self,
        *,
        style: str,
        name: str | _Unset = UNSET,
        fontSize: float | _Unset = UNSET,
        font: str | _Unset = UNSET,
        bold: bool | _Unset = UNSET,
        italic: bool | _Unset = UNSET,
        underline: bool | _Unset = UNSET,
        strikethrough: bool | _Unset = UNSET,
        align: Literal["left", "center", "right", "distributed"] | _Unset = UNSET,
        textColor: str | dict[str, Any] | _Unset = UNSET,
        shadow: dict[str, Any] | None | _Unset = UNSET,
        lineHeight: float | _Unset = UNSET,
        letterSpacing: float | _Unset = UNSET,
        indentLeft: float | _Unset = UNSET,
        indentRight: float | _Unset = UNSET,
        indentFirstLine: float | _Unset = UNSET,
    ) -> Any:
        """修改文字樣式

        修改文字樣式的欄位或名稱，只改有給的欄位。連到它的文字（所有頁面與主頁）會跟著改，但各自覆寫（和舊樣式不同）的欄位不變。文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。 回傳是否有變更與受影響的文字數。一次呼叫 = 一筆復原紀錄。

        Args:
            style: 文字樣式的名稱或 id（由 list_text_styles 取得）
            name: 新名稱（可省略）
            fontSize: 字級（pt）（可省略）
            font: 字型：內建的 黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱或 id（由 list_fonts 取得）（可省略）
            bold: （可省略）
            italic: （可省略）
            underline: （可省略）
            strikethrough: （可省略）
            align: （可省略）
            textColor: 文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票（可省略）
            shadow: 文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影（可省略）
            lineHeight: 行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5（可省略）
            letterSpacing: 字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0（可省略）
            indentLeft: 左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0（可省略）
            indentRight: 右縮排：每一行離文字框右緣的距離（字）；預設 0（可省略）
            indentFirstLine: 首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("update_text_style", _args({"style": style, "name": name, "fontSize": fontSize, "font": font, "bold": bold, "italic": italic, "underline": underline, "strikethrough": strikethrough, "align": align, "textColor": textColor, "shadow": shadow, "lineHeight": lineHeight, "letterSpacing": letterSpacing, "indentLeft": indentLeft, "indentRight": indentRight, "indentFirstLine": indentFirstLine}))

    def delete_text_style(
        self,
        *,
        style: str,
    ) -> Any:
        """刪除文字樣式

        刪除文字樣式。連到它的文字外觀不變，只是不再連到樣式。回傳取消連結的文字數。一次呼叫 = 一筆復原紀錄。

        Args:
            style: 文字樣式的名稱或 id（由 list_text_styles 取得）

        Returns:
            The tool's JSON result.
        """
        return self._call("delete_text_style", _args({"style": style}))

    def apply_text_style(
        self,
        *,
        ids: list[str],
        style: str | None,
    ) -> Any:
        """套用文字樣式

        讓同一頁（或同一主頁）的文字物件與圖形內文字連到文字樣式，並取樣式的所有值（清除覆寫）；style 為 null = 只取消連結、外觀不變。圖片與沒有文字的圖形會略過並列在 skipped。一次呼叫 = 一筆復原紀錄。

        Args:
            ids:
            style: 文字樣式的名稱或 id；null = 取消連結

        Returns:
            The tool's JSON result.
        """
        return self._call("apply_text_style", _args({"ids": ids, "style": style}))

    def list_shapes(self) -> Any:
        """圖形清單

        列出 add_shape 能建立的所有圖形：id、名稱、分類、點一下建立時的預設大小（pt），以及圖形庫圖形的參數（名稱、說明、ratio = 0–1 的比例 / pt = 固定長度、範圍、預設值）。基本圖形（rect、roundedRect、ellipse、triangle、star）沒有參數，矩形圓角用 update_element 的 cornerRadius。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_shapes", _args({}))

    def list_fonts(self) -> Any:
        """字型清單

        列出可用的字型：內建字型（黑體 / 明體 / 楷體 / 圓體）與使用者匯入這份文件的專案字型（id、名稱、缺字時用的內建字型種類、有沒有粗體檔、授權、使用數）。文字樣式參數 font 給名稱或 id 就用那套字型。專案字型只能由使用者在 App 的「設定 → 文件 → 字型...」匯入；沒有粗體檔的字型，bold 看起來和一般相同。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_fonts", _args({}))

    def list_swatches(self) -> Any:
        """色票清單

        列出文件色票（具名、不透明的顏色）：id、名稱、顏色 #rrggbb、連到它的顏色數（物件的文字 / 填色 / 邊框 / 陰影、頁面與主頁背景、文字樣式、頁碼都算）。顏色參數給 { swatch: 名稱或 id } 就連到色票；改色票（update_swatch）時，連到它的地方一起變（各自的不透明度保留）。

        Returns:
            The tool's JSON result.
        """
        return self._call("list_swatches", _args({}))

    def add_swatch(
        self,
        *,
        name: str,
        color: str,
    ) -> Any:
        """新增色票

        新增一個文件色票，回傳 id。名稱必填（最多 50 字、不可和其他色票同名）；顏色 #rrggbb（不透明，透明度在使用的地方用 opacity 設定）。一次呼叫 = 一筆復原紀錄。

        Args:
            name: 色票名稱，例如「品牌紅」
            color: #rrggbb（不透明）

        Returns:
            The tool's JSON result.
        """
        return self._call("add_swatch", _args({"name": name, "color": color}))

    def update_swatch(
        self,
        *,
        swatch: str,
        name: str | _Unset = UNSET,
        color: str | _Unset = UNSET,
    ) -> Any:
        """修改色票

        修改色票的名稱或顏色，只改有給的欄位。改顏色時，所有連到它的地方（所有頁面與主頁、文字樣式、頁碼）一起變，各自的不透明度保留。回傳是否有變更與連到它的顏色數。一次呼叫 = 一筆復原紀錄。

        Args:
            swatch: 色票的名稱或 id（由 list_swatches 取得）
            name: 新名稱（可省略）
            color: #rrggbb（不透明）（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("update_swatch", _args({"swatch": swatch, "name": name, "color": color}))

    def delete_swatch(
        self,
        *,
        swatch: str,
        replaceWith: str | None | _Unset = UNSET,
    ) -> Any:
        """刪除色票

        刪除色票。連到它的地方：給 replaceWith（另一個色票的名稱或 id）時改成那個色票（各自的不透明度保留）；省略或 null 時保留原本的顏色、只取消連結。回傳受影響的顏色數。一次呼叫 = 一筆復原紀錄。

        Args:
            swatch: 色票的名稱或 id（由 list_swatches 取得）
            replaceWith: 改連到這個色票；省略或 null = 保留顏色、取消連結（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("delete_swatch", _args({"swatch": swatch, "replaceWith": replaceWith}))

    def list_library_items(
        self,
        *,
        kind: Literal["image", "text", "audio"] | _Unset = UNSET,
        query: str | _Unset = UNSET,
        folderId: str | _Unset = UNSET,
        includeTrashed: bool | _Unset = UNSET,
    ) -> Any:
        """素材清單

        列出專案素材庫（使用者匯入的圖片、文字檔、音訊）的資料夾與素材，新匯入的在前。素材：id、名稱、種類（image / text / audio）、所在資料夾路徑（null = 未分類）、檔案大小（bytes）；圖片另有像素尺寸 width / height，文字檔另有開頭摘錄。可依種類、名稱（包含，不分大小寫）、資料夾（含子資料夾）篩選；垃圾桶裡的素材預設不列，includeTrashed 為 true 時排在最後。新增圖片素材用 import_library_item；刪除、移動素材不能用工具。

        Args:
            kind: 只列這一種素材（可省略）
            query: 名稱包含這段文字（不分大小寫）（可省略）
            folderId: 只列這個資料夾（含子資料夾）的素材；id 由本工具回傳的 folders 取得（可省略）
            includeTrashed: 也列出垃圾桶裡的素材（預設 false）（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("list_library_items", _args({"kind": kind, "query": query, "folderId": folderId, "includeTrashed": includeTrashed}))

    def import_library_item(
        self,
        *,
        path: str,
        folderId: str | _Unset = UNSET,
        name: str | _Unset = UNSET,
    ) -> Any:
        """匯入圖片到素材庫

        把這台電腦上的圖片檔匯入專案的素材庫（和使用者在 App 裡匯入相同：檔案複製進專案資料夾），回傳素材的 itemId、名稱、所在資料夾路徑、像素尺寸 width / height 與 status。之後用 place_library_item 放到頁面，或用 add_shape / update_element 的 image 放進圖形。path 是圖片檔的絕對路徑（例如其他工具產生或下載的圖片）；支援 PNG、JPEG、WebP、GIF、SVG，單檔 20 MB 以內，內容必須是能顯示的圖片。folderId 省略 = 未分類（id 由 list_library_items 的 folders 取得）；name 省略 = 檔名（含副檔名，和使用者在 App 匯入相同）。內容相同的檔案已經在素材庫時不會重複加入：status 是 duplicate，回傳原本那一筆（資料夾與名稱不變）；它在垃圾桶時還原到 folderId，status 是 restored；其他情況 status 是 new。素材庫的變更立即存檔，不能用 undo 復原；這個工具不能放進 batch（先單獨匯入，再把放到頁面的操作放進 batch）。

        Args:
            path: 圖片檔的絕對路徑，例如 C:\\Users\\me\\Pictures\\cover.png
            folderId: 放進這個資料夾；省略 = 未分類（可省略）
            name: 素材名稱（最多 255 字）；省略 = 檔名（含副檔名）（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("import_library_item", _args({"path": path, "folderId": folderId, "name": name}))

    def place_library_item(
        self,
        *,
        item: str,
        pageId: str | _Unset = UNSET,
        x: float | _Unset = UNSET,
        y: float | _Unset = UNSET,
        width: float | _Unset = UNSET,
    ) -> Any:
        """把素材放到頁面

        把素材庫裡的圖片放到頁面或主頁（放在最上層），回傳新物件的 id 與尺寸（pt）。item 是素材 id 或名稱（名稱要完全相符；同名的素材不只一個時請改用 id）。x / y 是圖片外框左上角（pt），省略的那一軸置中於頁面。width 省略時和使用者從素材面板放到頁面相同：原始像素當 pt，太大時縮到頁面寬、高的一半以內；給 width 時高度依原圖比例算（要改比例再用 update_element）。省略 pageId = 使用者正在看的頁面；指定別頁不會切換使用者的畫面。目前只能放圖片：文字檔請讀 list_library_items 的摘錄後用 add_text，音訊不能放到頁面，垃圾桶裡的素材要使用者先還原。一次呼叫 = 一筆復原紀錄。

        Args:
            item: 素材 id 或名稱（由 list_library_items 取得）
            pageId: 頁面或主頁的 id（由 list_pages 取得）（可省略）
            x: （可省略）
            y: （可省略）
            width: 寬度（pt），高度依原圖比例（可省略）

        Returns:
            The tool's JSON result.
        """
        return self._call("place_library_item", _args({"item": item, "pageId": pageId, "x": x, "y": y, "width": width}))

    def rename_page(
        self,
        *,
        pageId: str,
        name: str,
    ) -> Any:
        """頁面改名

        修改頁面或主頁的名稱（最多 50 字，前後空白會去掉）。一次呼叫 = 一筆復原紀錄。

        Args:
            pageId: 頁面或主頁的 id（由 list_pages 取得）
            name:

        Returns:
            The tool's JSON result.
        """
        return self._call("rename_page", _args({"pageId": pageId, "name": name}))

    def set_page_background(
        self,
        *,
        pageId: str,
        color: str | dict[str, Any],
    ) -> Any:
        """頁面背景色

        設定頁面或主頁的背景色：#rrggbb（不能透明），或 { swatch: 色票名稱或 id } 連到文件色票（改色票時跟著變）。主頁的背景不會套到使用它的頁面上（每頁有自己的背景）。一次呼叫 = 一筆復原紀錄。

        Args:
            pageId: 頁面或主頁的 id（由 list_pages 取得）
            color: #rrggbb（不連色票），或 { swatch: 色票名稱或 id }（連到文件色票；背景不能透明）

        Returns:
            The tool's JSON result.
        """
        return self._call("set_page_background", _args({"pageId": pageId, "color": color}))

    def rename_document(
        self,
        *,
        name: str,
    ) -> Any:
        """文件改名

        修改文件名稱（最多 100 字）。一次呼叫 = 一筆復原紀錄。

        Args:
            name:

        Returns:
            The tool's JSON result.
        """
        return self._call("rename_document", _args({"name": name}))

    def undo(self) -> Any:
        """復原

        復原上一步，和使用者按 Ctrl+Z 相同：復原的是文件最近的一個變更，不論是 AI 還是使用者做的。沒有可以復原的步驟時回錯誤。

        Returns:
            The tool's JSON result.
        """
        return self._call("undo", _args({}))

    def redo(self) -> Any:
        """重做

        重做上一個被復原的步驟，和使用者按 Ctrl+Y 相同。沒有可以重做的步驟時回錯誤。

        Returns:
            The tool's JSON result.
        """
        return self._call("redo", _args({}))


TOOL_NAMES: Final = frozenset({
    "add_line",
    "add_master",
    "add_page",
    "add_shape",
    "add_swatch",
    "add_text",
    "add_text_style",
    "apply_text_style",
    "delete_elements",
    "delete_swatch",
    "delete_text_style",
    "get_document",
    "get_element",
    "import_library_item",
    "list_commands",
    "list_elements",
    "list_fonts",
    "list_library_items",
    "list_pages",
    "list_shapes",
    "list_swatches",
    "list_text_styles",
    "place_library_item",
    "redo",
    "rename_document",
    "rename_page",
    "run_command",
    "set_page_background",
    "set_page_master",
    "undo",
    "update_element",
    "update_swatch",
    "update_text_style",
})

BATCH_OPS_MAX: Final = 200
"""Most operations the `batch` tool accepts in one call."""
