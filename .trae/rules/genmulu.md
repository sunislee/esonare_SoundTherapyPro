1.	根目录定义：
•	项目的唯一合法根目录为 /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/。
•	禁止将子目录或备份目录（如 SoundTherapy081/）误认为是 Git 根目录。
	2.	环境版本锚定（不可更改）：
•	React Native 版本：必须锁定在 0.81.5（为了兼容 Android 16k Page Size）。
•	React 版本：必须锁定在 19.1.0。
•	禁止回退：严禁在任何情况下尝试回退到 0.77.0 或 React 18.2.0，无论 Git 历史显示什么。
	3.	物理同步规则：
•	当根目录环境混乱时，唯一合法操作是将 SoundTherapy081/ 目录下的所有内容（package.json、android/、src/）物理覆盖到根目录。
•	覆盖后，以物理文件内容为准，忽略过时的 Git 索引信息。
	4.	操作优先级：
•	物理文件一致性 > Git 历史记录 > 你的自动联想。
•	如果发现 package.json 变回了 0.77.0，立刻报错并手动改回 0.81.5，不准提问。