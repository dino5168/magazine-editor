"""School magazine template: layout measured from a FlipHTML5 template (px on its 794 x 1123 page), own content.

Each element: (kind, style_or_opts, [x, y, w, h], text_or_label). Coordinates and sizes are the
reference's px (x 0.75 = pt on A4); h is the reference box height, used only by `fitcheck` to make
sure our text (Geist, wider than the reference's Inter) still fits. Kinds: T text, IMG photo
placeholder, LINE bar (at least 4 pt, the app's minimum), DOT circle, BOX rectangle.
Report: docs/00-需求分析/07-抓網頁產生範本-報告.md
"""

SWATCHES = [
    ("深藍", "#2d3748"), ("內文灰", "#575f6d"), ("主題藍", "#4299e1"), ("淺藍", "#8dc2ed"),
    ("點綴綠", "#68d391"), ("點綴粉", "#f687b3"), ("點綴淡藍", "#bee3f8"), ("點綴黃", "#faf087"),
    ("線條灰", "#e6e6e6"), ("佔位灰", "#edf2f7"),
]

# px sizes from the reference; converted to pt (x 0.75) by the builder
BUILTIN_STYLE_UPDATES = {
    "標題": dict(px=53, bold=True, align="left", lineHeight=1.0, color="深藍"),
    "副標題": dict(px=21, bold=False, align="left", lineHeight=1.15, color="淺藍"),
    "內文": dict(px=18, bold=False, align="left", lineHeight=1.3, color="內文灰"),
}
NEW_STYLES = {
    "封面刊名": dict(px=172, bold=True, align="left", lineHeight=1.0, letterSpacing=-11, color="深藍"),
    "封面副刊名": dict(px=42, bold=False, align="center", lineHeight=1.0, letterSpacing=24, color="深藍"),
    "小標": dict(px=24, bold=True, align="left", lineHeight=1.1, color="主題藍"),
    "目錄編號": dict(px=30, bold=True, align="left", lineHeight=1.28, color="深藍"),
    "欄目標題": dict(px=21, bold=True, align="left", lineHeight=1.28, color="深藍"),
    "圖說": dict(px=18, bold=False, align="center", lineHeight=1.28, color="內文灰"),
    "標籤": dict(px=18, bold=True, align="left", lineHeight=1.0, color="主題藍"),
    "提問": dict(px=18, bold=False, align="left", lineHeight=1.28, color="深藍"),
    "頁尾": dict(px=12, bold=False, align="left", lineHeight=1.2, color="內文灰"),
}

MASTER_NAME = "內頁"
MASTER = [
    ("T", "標題", [54, 50, 685, 95], "{頁面名稱}"),
    ("T", "頁尾", [54, 1092, 400, 16], "MAPLEWOOD SCHOOL MAGAZINE  ·  ISSUE 02"),
    ("T", {"style": "頁尾", "align": "right"}, [589, 1092, 150, 16], "{頁碼}"),
]

IMG, T, LINE, DOT, BOX = "IMG", "T", "LINE", "DOT", "BOX"

PAGES = [
    # 1 cover
    {"name": "Cover", "master": False, "items": [
        (IMG, {}, [0, 311, 794, 697], "COVER PHOTO"),
        (BOX, {"stroke": "線條灰"}, [54, 52, 685, 29], None),
        (T, "內文", [67, 54, 120, 23], "VOLUME 7"),
        (T, "內文", [370, 54, 100, 23], "ISSUE 02"),
        (T, {"style": "內文", "align": "right"}, [629, 54, 100, 23], "2026"),
        (T, "封面刊名", [49, 86, 741, 168], "SCHOOL"),
        (T, "封面副刊名", [247, 247, 300, 38], "MAGAZINE"),
        (DOT, "點綴綠", [54, 1034, 10, 10], None),
        (DOT, "點綴粉", [71, 1034, 10, 10], None),
        (DOT, "點綴淡藍", [87, 1034, 10, 10], None),
        (T, "內文", [53, 1057, 686, 23], "Stories and everyday moments from the students of Maplewood."),
    ]},
    # 2 contents
    {"name": "Contents", "master": False, "items": [
        (T, {"style": "標題", "align": "center"}, [162, 42, 470, 61], "CONTENTS"),
        (IMG, {}, [54, 797, 680, 276], "PHOTO"),
    ]},
    # 3 principal
    {"name": "A Note from the Principal", "master": False, "items": [
        (IMG, {"round": True}, [54, 109, 218, 218], "PORTRAIT"),
        (T, {"style": "標題", "color": "主題藍"}, [301, 127, 439, 95], "A NOTE FROM THE PRINCIPAL"),
        (LINE, "主題藍", [301, 237, 94, 1], None),
        (T, {"style": "副標題", "px": 30, "italic": True, "lineHeight": 1.0}, [301, 255, 440, 54], "A YEAR OF CURIOSITY, COURAGE AND KINDNESS"),
        (T, {"style": "內文", "bold": True, "align": "center"}, [91, 369, 145, 20], "Dr. Helena Ward"),
        (T, {"style": "內文", "align": "center"}, [91, 390, 145, 20], "Principal"),
        (T, "內文", [298, 330, 274, 20], "Dear Students and Families,"),
        (T, "內文", [298, 368, 440, 83], "It is a pleasure to welcome you to the second issue of our school magazine, written, photographed and designed by our own students."),
        (T, "內文", [298, 469, 440, 147], "Every week our hallways are full of small achievements that rarely make the news: a quiet student who finally speaks up in class, a team that rebuilds a failed experiment, a teacher who stays late to help with a project. These pages are our way of noticing those moments and saying thank you to the people behind them."),
        (T, "內文", [298, 633, 440, 125], "In this issue you will read about learning that happens outside the classroom, meet a student who turned a difficult year into a turning point, and discover clubs that welcome anyone willing to try something new."),
        (T, "內文", [298, 776, 440, 105], "Thank you to every family, volunteer and staff member who supports our community. Your encouragement is the reason our students feel confident enough to take on new challenges."),
        (T, "內文", [301, 898, 160, 20], "With gratitude,"),
        (T, {"style": "內文", "align": "right"}, [589, 975, 150, 20], "Dr. Helena Ward"),
        (T, {"style": "內文", "align": "right"}, [589, 996, 150, 20], "Principal"),
    ]},
    # 4 feature
    {"name": "LEARNING BEYOND FOUR WALLS", "master": True, "items": [
        (T, "內文", [54, 173, 684, 105], "Some lessons cannot be taught from a textbook. This term our students visited a wetland reserve, interviewed local business owners and worked with engineers at the city water plant. Each visit began with a question from the classroom and ended with new ones to bring back."),
        (LINE, "線條灰", [54, 300, 42, 1], None),
        (T, "小標", [54, 313, 210, 65], "LEARNING THROUGH EXPERIENCE"),
        (IMG, {}, [291, 315, 447, 279], "PHOTO"),
        (T, "內文", [54, 419, 210, 376], "At the wetland reserve, Grade 8 students measured water quality at five points along the river and compared their results with data from ten years ago. Several groups found surprising differences. Their teacher says the best moments came when results did not match predictions and students had to work out why."),
        (T, "內文", [291, 629, 210, 168], "Back at school, students turned their notes into short reports and shared them with younger classes in their own words."),
        (T, "內文", [528, 629, 210, 188], "Teachers say the trips also changed how students work together. Groups that rarely spoke in class learned to divide tasks, check each other's measurements and solve problems."),
        (T, "小標", [54, 832, 210, 44], "SKILLS FOR LIFE"),
        (T, "內文", [54, 889, 210, 188], "Communication, planning and patience are not on any report card, but every trip tested them. Students learned to ask clear questions and adapt."),
        (T, "小標", [293, 825, 210, 65], "A COMMUNITY THAT TEACHES"),
        (T, "內文", [293, 910, 210, 168], "Parents, local experts and alumni volunteered as guides. Their stories showed students how classroom subjects connect to real careers in their own town."),
        (T, "內文", [530, 847, 210, 230], "Next term the program will expand to include a visit to the regional hospital and a week of field work at the coastal research station. Interested students should speak with their science teacher."),
    ]},
    # 5 news
    {"name": "CAMPUS NEWS", "master": True, "items": [
        (T, "副標題", [54, 109, 549, 19], "HIGHLIGHTS AND HAPPENINGS FROM THIS TERM"),
        (T, "內文", [54, 140, 654, 20], "A quick look at the people and projects that kept our campus busy."),
        (IMG, {}, [53, 189, 686, 214], "PHOTO"),
        (T, "小標", [54, 428, 685, 44], "STUDENT VOLUNTEERS RAISE FUNDS FOR THE CITY FOOD BANK"),
        (T, "內文", [54, 489, 685, 63], "Over three weekends, more than eighty students organized bake sales, a charity run and a used book market. Together they raised enough to provide meals for two hundred families and earned a thank-you visit from the food bank director."),
        (IMG, {}, [54, 587, 202, 112], "PHOTO"),
        (IMG, {}, [297, 588, 202, 110], "PHOTO"),
        (IMG, {}, [538, 588, 202, 110], "PHOTO"),
        (T, "小標", [54, 720, 202, 87], "YOUNG INVENTORS WIN REGIONAL AWARD"),
        (T, "內文", [53, 828, 208, 251], "Four Grade 10 students designed a low-cost sensor that warns gardeners when soil becomes too dry. The judges praised its simple design and careful testing, and the team will present at the national round in spring."),
        (T, "小標", [296, 720, 202, 87], "BASKETBALL TEAM ENDS A STRONG SEASON"),
        (T, "內文", [296, 828, 202, 210], "Our girls' basketball team finished second in the league after a season of hard training and close games. The coach praised the players for supporting each other on and off the court."),
        (T, "小標", [538, 720, 202, 87], "THE NEW LIBRARY LEARNING SPACE IS OPEN"),
        (T, "內文", [538, 828, 202, 251], "The renovated library now offers quiet study rooms, a small recording studio and flexible tables for group work. Students are already booking the rooms for projects, podcasts and tutoring."),
    ]},
    # 6 spotlight
    {"name": "STUDENT SPOTLIGHT", "master": True, "items": [
        (T, "副標題", [54, 109, 648, 19], "HOW ONE STUDENT LEARNED TO LEAD BY LISTENING"),
        (T, "內文", [54, 162, 680, 42], "Meet Jonah Reyes, a Grade 11 student who chairs the student council and volunteers as a reading mentor."),
        (T, "內文", [54, 222, 684, 83], "Jonah says leadership surprised him. He expected it to be about giving speeches, but discovered it is mostly about listening carefully, asking good questions and following through on small promises. We asked him about the year so far."),
        (IMG, {}, [54, 343, 227, 733], "PORTRAIT"),
        (DOT, {"fill": "主題藍", "text": "Q"}, [316, 346, 35, 35], None),
        (T, "提問", [368, 346, 370, 63], "WHAT WAS THE HARDEST PART OF YOUR FIRST MONTH AS COUNCIL CHAIR?"),
        (DOT, {"fill": "淺藍", "text": "A"}, [316, 422, 35, 35], None),
        (T, "內文", [368, 422, 370, 168], "Saying no. Everyone had great ideas, and at first I tried to support all of them. Within a few weeks we had too many projects and not enough people. I learned to choose a few goals, explain why, and make sure each one had a team that could actually finish it."),
        (LINE, "線條灰", [316, 609, 421, 1], None),
        (DOT, {"fill": "主題藍", "text": "Q"}, [316, 635, 35, 35], None),
        (T, "提問", [368, 635, 370, 42], "WHICH MOMENT ARE YOU MOST PROUD OF THIS YEAR?"),
        (DOT, {"fill": "淺藍", "text": "A"}, [316, 689, 35, 35], None),
        (T, "內文", [368, 689, 366, 147], "Watching a Grade 7 student I mentor read a full chapter aloud to the class. In September she would not read a single sentence in front of others. Her confidence grew a little every week, and that reminded me that progress is usually slow."),
        (LINE, "線條灰", [316, 854, 421, 1], None),
        (DOT, {"fill": "主題藍", "text": "Q"}, [316, 880, 35, 35], None),
        (T, "提問", [368, 880, 370, 42], "WHAT ADVICE WOULD YOU GIVE NEW STUDENTS?"),
        (DOT, {"fill": "淺藍", "text": "A"}, [316, 934, 35, 35], None),
        (T, "內文", [368, 934, 370, 147], "Join one thing that scares you a little. It could be a club, a team or a class you think is too hard. You will meet people you would never have met otherwise, and you will find out you can do more than you think."),
    ]},
    # 7 classrooms
    {"name": "CLASSROOMS THAT SPARK CURIOSITY", "master": True, "items": [
        (BOX, {"fill": "主題藍", "opacity": 0.15}, [0, 843, 794, 281], None),
        (T, "副標題", [54, 157, 685, 38], "HOW OUR TEACHERS ARE RETHINKING THE WAY LESSONS ARE PLANNED, SHARED AND EXPERIENCED"),
        (IMG, {}, [54, 237, 202, 204], "PHOTO"),
        (T, "小標", [297, 233, 202, 65], "LEARNING IN SMALL TEAMS"),
        (T, "內文", [297, 316, 202, 313], "Many classes now begin with a short challenge that students solve in groups of three or four. Instead of waiting for the answer, they compare ideas, test them and explain their thinking to the class. Teachers move between groups, asking questions rather than giving instructions."),
        (IMG, {}, [538, 237, 202, 143], "PHOTO"),
        (T, "小標", [538, 403, 202, 44], "LESSONS THAT MOVE"),
        (T, "內文", [538, 466, 202, 335], "Some of our most popular lessons do not happen at desks at all. Math classes measure the school garden, history classes act out debates from the past and language classes interview visitors. Teachers find that students remember more when their bodies and voices are part of the lesson."),
        (T, "內文", [53, 466, 202, 335], "A classroom is more than four walls and a whiteboard. Over the summer several teachers rearranged their rooms with movable tables, reading corners and display walls for student work. The goal was simple: make it easy to switch between quiet focus, group discussion and hands-on projects."),
        (IMG, {}, [296, 652, 202, 142], "PHOTO"),
        (T, "小標", [54, 885, 375, 22], "GROWING TOGETHER"),
        (T, "內文", [54, 923, 444, 147], "The best classrooms are built on trust. When students feel safe to make mistakes, they ask more questions and take bigger risks. Our teachers meet every month to share what worked, what did not, and what they want to try next, so good ideas spread quickly from one room to another."),
        (IMG, {}, [538, 889, 202, 180], "PHOTO"),
    ]},
    # 8 a day
    {"name": "ONE DAY AT SCHOOL", "master": True, "items": [
        (T, "內文", [54, 132, 651, 42], "From the first bell to the last bus, we followed a Grade 9 class through an ordinary Tuesday to see what a day at Maplewood really looks like."),
        (IMG, {}, [54, 202, 685, 308], "PHOTO GALLERY"),
        (T, "小標", [54, 550, 388, 22], "MORNING LESSONS"),
        (T, "內文", [54, 587, 388, 83], "The day starts with science and literature. Students run a quick experiment, then discuss a short story in small circles before writing a reflection."),
        (IMG, {}, [488, 550, 252, 526], "PHOTO"),
        (T, "小標", [54, 704, 390, 22], "LUNCH AND FRIENDS"),
        (T, "內文", [54, 742, 390, 63], "Lunch is loud and busy. Some students play football, others meet in the art room or rehearse for the spring concert."),
        (T, "小標", [54, 842, 391, 22], "AFTERNOON PROJECTS"),
        (T, "內文", [54, 880, 391, 63], "In the afternoon the class works on a long-term history project, building a timeline of their neighborhood."),
        (T, "小標", [54, 972, 300, 22], "THE LAST BELL"),
        (T, "內文", [54, 1013, 390, 63], "When the bell rings, the day is not over for everyone. Clubs, sports and tutoring keep the building lively."),
    ]},
    # 9 clubs
    {"name": "FIND YOUR PASSION", "master": True, "items": [
        (T, "內文", [54, 127, 685, 42], "More than twenty clubs meet every week at Maplewood. Here is a small sample of what is on offer and how to get involved this term."),
        (T, "小標", [54, 200, 400, 22], "MEET OUR CLUBS"),
        (T, "內文", [54, 240, 685, 20], "Whether you like building, performing or helping others, there is a place for you."),
        (IMG, {}, [54, 283, 116, 118], "PHOTO"), (IMG, {}, [192, 283, 116, 118], "PHOTO"), (IMG, {}, [330, 283, 116, 118], "PHOTO"),
        (T, "圖說", [54, 406, 116, 42], "Science Club"), (T, "圖說", [192, 406, 116, 42], "Art Studio"), (T, "圖說", [330, 406, 116, 42], "Debate Society"),
        (IMG, {}, [54, 462, 116, 118], "PHOTO"), (IMG, {}, [192, 462, 116, 118], "PHOTO"), (IMG, {}, [330, 462, 116, 118], "PHOTO"),
        (T, "圖說", [54, 586, 116, 42], "Student Council"), (T, "圖說", [192, 586, 116, 42], "Photography Club"), (T, "圖說", [330, 586, 116, 42], "Music Ensemble"),
        (T, "小標", [54, 656, 414, 22], "SPOTLIGHT: DEBATE SOCIETY"),
        (T, "內文", [54, 696, 391, 125], "The Debate Society meets every Thursday to research current topics and practice structured arguments. New members start with short, friendly rounds before taking part in inter-school events."),
        (T, "內文", [54, 839, 391, 125], "Members say the club has made them better listeners. To argue well, they first have to understand the other side, which turns out to be useful in class, at home and in every group project."),
        (IMG, {}, [54, 985, 391, 91], "PHOTO"),
        (LINE, "線條灰", [483, 283, 1, 793], None),
        (T, "小標", [522, 283, 217, 44], "HOW TO JOIN A CLUB"),
        (IMG, {}, [522, 350, 217, 159], "PHOTO"),
        (DOT, {"fill": "淺藍", "text": "1"}, [522, 541, 33, 33], None),
        (T, "標籤", [565, 541, 120, 16], "STEP 1"),
        (T, "內文", [565, 567, 178, 83], "Browse the club list on the notice board or school website."),
        (DOT, {"fill": "淺藍", "text": "2"}, [522, 680, 33, 33], None),
        (T, "標籤", [565, 678, 120, 16], "STEP 2"),
        (T, "內文", [565, 708, 178, 83], "Visit a meeting and talk with the members and advisor."),
        (DOT, {"fill": "淺藍", "text": "3"}, [522, 814, 33, 33], None),
        (T, "標籤", [565, 814, 120, 16], "STEP 3"),
        (T, "內文", [565, 844, 173, 83], "Fill in the sign-up form and join the first session."),
        (T, "內文", [522, 953, 217, 125], "It is never too late to join. Most clubs welcome new members at any point in the year."),
    ]},
    # 10 future
    {"name": "LOOKING AHEAD", "master": True, "items": [
        (T, "副標題", [54, 109, 648, 19], "PREPARING FOR LIFE AFTER GRADUATION"),
        (IMG, {}, [53, 150, 202, 270], "PHOTO"),
        (T, "小標", [298, 150, 200, 22], "TEAMWORK"),
        (T, "內文", [297, 189, 200, 230], "Very few goals are reached alone. Our senior students practise this every day in group projects, peer tutoring and community service, learning to share ideas and responsibility."),
        (T, "內文", [530, 146, 200, 168], "Careers are changing quickly, and many of today's students will work in jobs that do not exist yet. Curiosity will matter."),
        (T, "內文", [531, 338, 199, 188], "That is why we encourage every student to try new subjects, ask for feedback and treat mistakes as part of learning."),
        (T, "內文", [52, 456, 202, 293], "This year our career week brought in nurses, designers, engineers and small business owners. Students asked them about their first jobs, their biggest mistakes and the skills they use every day. Many were surprised by how often the answer was simply 'keep learning'."),
        (T, "小標", [297, 454, 200, 22], "KEEP GROWING"),
        (T, "內文", [297, 493, 200, 83], "Graduation is a beginning, not an ending. Learning continues."),
        (IMG, {}, [297, 616, 441, 460], "PHOTO"),
        (T, "小標", [54, 789, 200, 44], "STAY CURIOUS"),
        (T, "內文", [53, 847, 200, 230], "Big ideas often start with a small question. Our innovation lab gives students time each week to explore their own questions, from building simple robots to designing posters for local charities."),
    ]},
    # 11 wellbeing
    {"name": "FINDING BALANCE IN A BUSY SCHOOL YEAR", "master": True, "items": [
        (T, "副標題", [54, 155, 685, 19], "SIMPLE WAYS TO LOOK AFTER YOUR MIND AND BODY"),
        (T, "內文", [54, 204, 685, 63], "School life can be exciting, but it can also be busy and stressful. Exams, activities and friendships all compete for attention. Taking care of your well-being helps you enjoy the good moments and handle the hard ones."),
        (IMG, {}, [56, 306, 330, 364], "VIDEO"),
        (T, "小標", [419, 301, 320, 44], "WHY WELL-BEING MATTERS"),
        (T, "內文", [419, 364, 320, 125], "Rest, friendships and time for hobbies are not distractions from learning. They give you the energy and focus you need to do your best work and to keep going when things get hard."),
        (T, "小標", [419, 524, 320, 44], "ASKING FOR HELP"),
        (T, "內文", [419, 587, 320, 83], "Everyone has difficult weeks. Talking to someone early often stops a small problem from growing."),
        (T, "標籤", [419, 693, 320, 16], "WHERE TO FIND SUPPORT"),
        (IMG, {}, [419, 734, 151, 101], "PHOTO"), (IMG, {}, [588, 733, 151, 101], "PHOTO"),
        (T, "圖說", [419, 842, 151, 20], "School Counselor"), (T, "圖說", [588, 842, 151, 20], "Class Teachers"),
        (IMG, {}, [419, 870, 151, 101], "PHOTO"), (IMG, {}, [588, 870, 151, 101], "PHOTO"),
        (T, "圖說", [419, 978, 151, 20], "Health Office"), (T, "圖說", [586, 979, 158, 20], "Peer Mentors"),
        (T, "內文", [419, 1012, 320, 63], "You never need a reason to visit. Doors are always open."),
        (T, "小標", [54, 708, 327, 44], "BUILDING HEALTHY HABITS"),
        (T, "內文", [56, 767, 325, 42], "Small daily choices add up to a calmer year."),
        (T, "標籤", [57, 828, 200, 16], "PLAN YOUR WEEK"),
        (T, "內文", [57, 854, 330, 20], "Write down deadlines in one place."),
        (T, "標籤", [56, 895, 200, 16], "MOVE EVERY DAY"),
        (T, "內文", [56, 921, 330, 20], "A short walk clears the mind."),
        (T, "標籤", [57, 962, 200, 16], "TAKE SHORT BREAKS"),
        (T, "內文", [57, 987, 330, 20], "Rest for five minutes every hour."),
        (T, "標籤", [56, 1030, 263, 16], "SLEEP WELL"),
        (T, "內文", [56, 1055, 330, 20], "Aim for eight hours on school nights."),
    ]},
    # 12 back
    {"name": "Back Cover", "master": False, "items": [
        (T, "欄目標題", [54, 50, 400, 25], "NEXT ISSUE PREVIEW"),
        (T, {"style": "內文", "italic": True}, [54, 83, 500, 23], "SCIENCE FAIR SPECIAL"),
        (T, "內文", [54, 110, 685, 46], "Meet the young researchers behind this year's science fair, from water sensors to solar ovens, and find out what they learned along the way."),
        (T, "欄目標題", [54, 178, 400, 25], "SHARE YOUR STORY"),
        (T, "內文", [54, 211, 684, 19], "Send us your articles, photos and artwork for the next issue."),
        (IMG, {}, [54, 264, 686, 490], "PHOTO"),
        (T, "欄目標題", [54, 787, 400, 25], "MAPLEWOOD SCHOOL MAGAZINE"),
        (T, "內文", [54, 820, 500, 23], "Curious minds. Kind hearts. Brave ideas."),
        (T, "內文", [54, 859, 686, 20], "Articles and photos by Maplewood students and staff."),
        (LINE, "主題藍", [54, 906, 682, 1], None),
        (T, "欄目標題", [54, 936, 300, 25], "EDITORIAL TEAM"),
        (T, "內文", [54, 968, 340, 19], "Editor-in-Chief: Dr. Helena Ward"),
        (T, "內文", [54, 991, 340, 19], "Editors: Student Media Club"),
        (T, "內文", [54, 1015, 340, 19], "Design: Grade 11 Design Class"),
        (T, "內文", [54, 1036, 340, 19], "Photography: Photography Club"),
        (T, "內文", [54, 1060, 340, 19], "Faculty Advisor: Ms. Priya Nair"),
        (T, "欄目標題", [417, 926, 300, 25], "CONTACT US"),
        (T, "內文", [417, 968, 327, 19], "Phone: (555) 010 2030"),
        (T, "內文", [417, 991, 327, 19], "Email: magazine@example.edu"),
        (T, "內文", [417, 1015, 327, 19], "Address: 12 Maple Road, Springfield"),
        (T, "內文", [417, 1038, 327, 19], "Website: www.example.edu"),
    ]},
]

# contents grid (page 2): three columns x three rows; numbers point at pages 3-11
CONTENT_ROWS = [
    # (bar y, number y, title y, desc y)
    (150, 168, 208, 241),
    (355, 375, 414, 471),
    (586, 606, 646, 704),
]
CONTENT_COLS = [(54, 208, "點綴綠"), (293, 208, "點綴黃"), (531, 208, "點綴淡藍")]
CONTENT_ENTRIES = [
    ("01", "PRINCIPAL'S NOTE", "A welcome message and a look at the year ahead"),
    ("02", "FEATURE STORY", "Learning beyond the walls of the classroom"),
    ("03", "CAMPUS NEWS", "Volunteers, inventors and a brand new library"),
    ("04", "STUDENT SPOTLIGHT", "How one student learned to lead by listening"),
    ("05", "INSPIRING CLASSROOMS", "New ways of planning, sharing and experiencing lessons"),
    ("06", "ONE DAY AT SCHOOL", "An ordinary Tuesday from first bell to last bus"),
    ("07", "FIND YOUR PASSION", "Clubs to explore and how to join them this term"),
    ("08", "LOOKING AHEAD", "Skills and habits for life after graduation"),
    ("09", "FINDING BALANCE", "Simple ways to care for your mind and body"),
]
contents_items = PAGES[1]["items"]
for idx, (num, title, desc) in enumerate(CONTENT_ENTRIES):
    bar_y, num_y, title_y, desc_y = CONTENT_ROWS[idx // 3]
    x, w, bar = CONTENT_COLS[idx % 3]
    contents_items.insert(-1, (LINE, bar, [x, bar_y, w, 4], None))
    contents_items.insert(-1, (T, "目錄編號", [x, num_y, 80, 35], num))
    contents_items.insert(-1, (T, "欄目標題", [x, title_y, w, desc_y - title_y - 8], title))
    contents_items.insert(-1, (T, "內文", [x, desc_y, w, 68], desc))

# master pages whose {頁面名稱} title wraps to two lines in the reference (page number -> lines);
# the page layouts below the title assume these line counts
REFERENCE_TITLE_LINES = {4: 2, 7: 2, 11: 2}
