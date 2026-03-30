# 中国大学生计算机设计大赛 - UML图代码

本文档包含第二章概要设计中各模块的UML图代码

---

## 0. 系统架构图【组件图 Component Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 2.1 系统架构

```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam componentBackgroundColor #f8f9fa
skinparam componentBorderColor #6c757d
skinparam packageBackgroundColor #e9ecef

top to bottom direction

component [页面管理模块] as PageManager
component [图片处理模块] as ImageProc
component [拼图游戏模块] as PuzzleGame
component [音乐播放模块] as MusicPlayer
component [教程模块] as Tutorial

PageManager --|> ImageProc : 管理

ImageProc --|> PuzzleGame : 图片数据
PuzzleGame --|> MusicPlayer : 状态同步
PuzzleGame --|> Tutorial : 引导触发
  component [Web Audio API] as AudioAPI
  component [Storage API] as StorageAPI
}

' 页面流转
HomePage --> ControlPanel
ControlPanel --> GameInterface
GameInterface --> CompletePage

' 核心交互
ControlPanel --> ImageProcessor
GameInterface --> PuzzleEngine
GameInterface --> InteractionController
GameInterface --> MusicPlayer

' API调用
ImageProcessor --> CanvasAPI
ImageProcessor --> FileAPI
MusicPlayer --> AudioAPI
LocalStorage --> StorageAPI

' 存储关系
PuzzleEngine --> LocalStorage
MusicPlayer --> LocalStorage

@enduml
```

---

## 1. 图片处理模块流程图【活动图 Activity Diagram】
**对应文档位置**：`中国大学生计算机设计大赛.md` → 第二章 概要设计 → 2.2.2 图片处理模块

```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam activityBackgroundColor #e1f5ff
skinparam activityBorderColor #01579b

start
:用户操作;
if (选择图片方式?) then (预设图片)
  :点击图片选择器;
  #fff9c4:加载预设图片;
else (自定义图片)
  :点击上传按钮;
  :File API读取本地文件;
endif
#fff9c4:创建Image对象;
:等待图片加载完成;
:Canvas绘制完整图片;
:计算自适应尺寸;
#ffccbc:按gridSize切割为N×N碎片;
:生成pieceData数组;
:转换为base64存储;
#c8e6c9:渲染碎片到界面;
stop

@enduml
```

---

## 2. 音乐播放模块类图【类图 Class Diagram】
**对应文档位置**：`中国大学生计算机设计大赛.md` → 第二章 概要设计 → 2.2.5 音乐播放模块（MusicPlayer类）

```plantuml
@startuml
!theme plain
skinparam classBackgroundColor #f3e5f5
skinparam classBorderColor #4a148c

class MusicPlayer {
  - btn : HTMLElement
  - panel : HTMLElement
  - audio : HTMLAudioElement
  - playlist : Array
  - currentIndex : int
  - isPlaying : boolean
  
  + constructor()
  + initPlayer()
  + initEvents()
  + renderPlaylist()
  + loadSong(index)
  + togglePlay()
  + play()
  + pause()
  + playNext()
  + playPrev()
  + seek(seconds)
  + setProgress(event)
  + updateProgress()
  + formatTime(seconds)
  + toggle()
  + open()
  + close()
}

class Song {
  + name : string
  + file : string
}

class HTMLAudioElement {
}

MusicPlayer "1" --> "*" Song : playlist
MusicPlayer --> HTMLAudioElement : uses

@enduml
```

**功能说明**：
- **播放控制**：支持播放/暂停、上一首/下一首、快进/快退
- **播放列表管理**：动态渲染歌曲列表，支持点击切歌
- **进度控制**：实时更新播放进度，支持拖动进度条跳转
- **自动播放**：歌曲结束后自动播放下一首
- **界面交互**：面板展开/收起，播放状态实时反馈

---

## 3. 拼图游戏模块类图【类图 Class Diagram】
**对应文档位置**：`中国大学生计算机设计大赛.md` → 第二章 概要设计 → 2.2.3 拼图游戏模块（PuzzleGame类）

```plantuml
@startuml
!theme plain
skinparam classBackgroundColor #e1f5ff
skinparam classBorderColor #01579b

class PuzzleGame {
  - originalImage : Image
  - gridSize : int
  - pieceData : Array
  - cells : Array
  - gameState : string
  - moveCount : int
  - modifiers : Object
  - rotatedPieces : Array
  - hiddenPieces : Array
  - isDragging : boolean
  - dragStartPos : Object
  
  + constructor()
  + initEvents()
  + generatePuzzle()
  + createGrid()
  + createPieces()
  + shufflePieces()
  + bindDragEvents(pieceDiv)
  + onDragStart(event, pieceDiv, isFromGrid)
  + onDragMove(event)
  + onDragEnd(event)
  + handlePieceClick(pieceDiv)
  + placeToCell(targetCell)
  + swapWithCell(targetCell, existingPiece)
  + checkCompletion()
  + rotateSelectedPiece()
  + solvePuzzle()
  + scheduleTrickster()
  + showComplete()
}

class PieceData {
  + row : int
  + col : int
  + imageData : string
  + rotated : boolean
  + hidden : boolean
}

class Modifiers {
  + rotation : boolean
  + hidden : boolean
  + trickster : boolean
}

class Canvas {
}

class TouchEvents {
}

PuzzleGame "1" --> "*" PieceData : pieceData
PuzzleGame "1" --> "1" Modifiers : modifiers
PuzzleGame --> Canvas : uses
PuzzleGame --> TouchEvents : handles

@enduml
```

**核心功能**：
- **拼图生成**：根据难度等级切割图片，生成碎片数据
- **交互处理**：支持拖拽和点击双模式，区分操作意图
- **难度词条**：旋转、隐藏、捣蛋鬼三种增强难度选项
- **完成检测**：实时检测所有碎片是否正确放置
- **辅助功能**：打乱、求解、旋转等操作

---

## 4. 模块调用关系流程图【活动图/时序图 Activity/Sequence Diagram】
**对应文档位置**：`中国大学生计算机设计大赛.md` → 第二章 概要设计 → 2.3 模块调用关系

### 方案A：详细活动图【活动图 Activity Diagram】
```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam activityBackgroundColor #f8f9fa
skinparam activityBorderColor #6c757d

start
:用户访问网站;
:页面管理模块加载;
:showPage('pageMain');
note right: 显示主页界面
:用户点击"开始游戏";
:showPage('pageControl');
note right: 切换到控制页面

if (选择图片?) then (预设图片)
  :点击图片选择器;
  :图片处理模块激活;
  :加载内置房树人图片;
else (自定义图片)
  :点击上传按钮;
  :File API读取本地文件;
  :Canvas API处理图片;
endif

:设置难度等级(gridSize);
:选择难度词条(modifiers);
:用户点击"生成拼图";

:PuzzleGame.generatePuzzle();
note right: 拼图游戏模块启动
:Canvas切割图片为N×N碎片;
:生成pieceData数组;
:createGrid() 创建拼图网格;
:createPieces() 创建碎片元素;
:showPage('pageGame');
note right: 切换到游戏界面

:用户开始拼图;
if (交互方式?) then (拖拽)
  :onDragStart() 拖拽开始;
  :onDragMove() 拖拽移动;
  :onDragEnd() 拖拽结束;
else (点击)
  :handlePieceClick() 选中碎片;
  :点击格子放置;
endif

:placeToCell() 放置碎片;
:checkCompletion() 检查完成状态;

if (是否完成?) then (未完成)
  :继续拼图;
else (已完成)
  :showComplete() 显示完成页面;
  :showPage('pageComplete');
  :统计游戏数据;
  stop
endif

@enduml
```

### 方案B：序列图【时序图 Sequence Diagram】（推荐，更简洁）
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

actor "用户" as User
participant "页面管理" as PageMgr
participant "图片处理" as ImageProc
participant "拼图游戏" as PuzzleGame
participant "Canvas API" as Canvas
participant "音乐播放" as MusicPlayer

User -> PageMgr: 访问网站
PageMgr -> User: 显示主页

User -> PageMgr: 点击"开始游戏"
PageMgr -> User: 显示控制页

User -> ImageProc: 选择/上传图片
ImageProc -> Canvas: 加载图片
Canvas -> ImageProc: 返回Image对象

User -> PuzzleGame: 设置难度并生成拼图
PuzzleGame -> Canvas: 切割图片为碎片
Canvas -> PuzzleGame: 返回碎片数据
PuzzleGame -> PageMgr: 创建游戏界面
PageMgr -> User: 显示游戏页面

loop 拼图过程
    User -> PuzzleGame: 拖拽/点击碎片
    PuzzleGame -> PuzzleGame: 处理交互事件
    PuzzleGame -> PuzzleGame: 检查完成状态
end

PuzzleGame -> PageMgr: 拼图完成
PageMgr -> User: 显示完成页面

note over MusicPlayer: 音乐播放模块\n独立运行，提供背景音乐

@enduml
```

---

## 5. 人机交互界面结构图【组件图 Component Diagram】
**对应文档位置**：`中国大学生计算机设计大赛.md` → 第二章 概要设计 → 2.4 人机交互界面

```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam componentBackgroundColor #e3f2fd
skinparam componentBorderColor #1976d2

top to bottom direction

component [主页界面] as main
note bottom of main : 游戏规则展示\n房树人心理学介绍\n"开始游戏"按钮\n渐变紫色背景

component [控制页界面] as control  
note bottom of control : 图片选择器\n难度滑块(2×2-6×6)\n难度词条复选框\n"生成拼图"按钮

component [游戏页界面] as game
note bottom of game : 拼图网格区域\n碎片容器(横向滚动)\n操作按钮组\n音乐播放控制

component [完成页界面] as complete
note bottom of complete : 庆祝动画效果\n游戏统计数据\n操作选择按钮\n问卷调查入口

main --|> control : 用户点击\n"开始游戏"
control --|> game : 配置完成后\n"生成拼图" 
game --|> complete : 拼图完成后\n自动跳转
complete --|> main : "返回主页"
complete --> game : "再玩一次"

@enduml
```

---

## 3.1.1 主页界面示意图【界面设计图 Interface Design Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.1.1 主页界面
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

rectangle "主页界面" {
  rectangle "标题区域" #e8eaf6
  rectangle "规则卡片" #f3e5f5
  rectangle "开始按钮" #c8e6c9
}

note bottom : 渐变紫色背景 + 游戏规则卡片 + 居中开始按钮

@enduml
```

## 3.1.2 控制配置界面示意图【界面设计图 Interface Design Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.1.2 控制配置界面
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

rectangle "控制配置界面" {
  rectangle "图片选择器" #e1f5ff
  rectangle "难度滑块(2×2-6×6)" #fff3e0
  rectangle "难度词条复选框" #f1f8e9
  rectangle "CTA生成按钮" #fce4ec
}

@enduml
```

## 3.1.3 游戏主界面示意图【界面设计图 Interface Design Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.1.3 游戏主界面
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

rectangle "游戏主界面" {
  rectangle "拼图网格区域" #e8f5e8
  rectangle "碎片容器(横向滚动)" #fff9c4
  rectangle "操作按钮组" #e1f5ff
  rectangle "音乐播放控制" #f3e5f5
}

note bottom : 上下分区布局设计

@enduml
```

## 3.1.4 完成结算界面示意图【界面设计图 Interface Design Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.1.4 完成结算界面
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

rectangle "完成结算界面" {
  rectangle "庆祝图标和文案" #c8e6c9
  rectangle "统计卡片(用时/步数)" #fff3e0
  rectangle "三个操作选择按钮" #e1f5ff
  rectangle "问卷调查入口" #f3e5f5
}

@enduml
```

---

## 3.2.1 数据存储方案示意图【部署图 Deployment Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.2.1 数据存储方案
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

database "LocalStorage" {
  [用户配置]
  [历史记录]
}

database "SessionStorage" {
  [临时游戏状态]
}

actor User
User -> [用户配置] : 保存偏好
User -> [临时游戏状态] : 游戏进行中
[临时游戏状态] -> [历史记录] : 完成后保存

@enduml
```

## 3.2.2 数据结构设计示意图【类图 Class Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.2.2 数据结构设计
```plantuml
@startuml
!theme plain
skinparam backgroundColor white

class GameConfig {
  selectedImage
  customImageData
  gridSize
  enabledModifiers
  musicEnabled
}

class GameState {
  gameState
  startTime
  moveCount
  pieceData
  gridData
  modifierStates
}

class GameHistory {
  gameId
  completionTime
  moveCount
  difficulty
  timestamp
}

class UserPreferences {
  theme
  soundVolume
  musicVolume
  showTutorial
}

@enduml
```

---

## 3.3.1 系统核心类图【类图 Class Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.3.1 类图总览

```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam classBackgroundColor #f8f9fa
skinparam classBorderColor #6c757d

class PuzzleGame {
  +generatePuzzle()
  +checkCompletion()
  +onPieceClick()
}

class ImageProcessor {
  +loadImage()
  +sliceImage()
}

class TouchHandler {
  +onDragStart()
  +onDragMove()
  +onDragEnd()
}

class MusicPlayer {
  +play()
  +pause()
  +next()
}

class StorageManager {
  +save()
  +load()
}

PuzzleGame --> ImageProcessor
PuzzleGame --> TouchHandler
PuzzleGame --> StorageManager
PuzzleGame --> MusicPlayer

@enduml
```

---

## 3.4.1 图像切割算法流程图【活动图 Activity Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.4.1 图像切割算法

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

start
:加载图片;
if (横图?) then (横图)
  :调整宽度;
else (竖图)
  :调整高度;
endif
:创建Canvas;
:绘制图片;
repeat
  :切割碎片;
repeat while (未完成?)
:生成碎片数据;
stop
@enduml
```

---

## 3.5.1 游戏主状态机【状态图 State Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.5.1 游戏状态机

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

[*] --> WAITING
WAITING --> CONFIGURING : 开始
CONFIGURING --> PLAYING : 生成拼图
PLAYING --> COMPLETED : 完成
COMPLETED --> CONFIGURING : 再玩
COMPLETED --> WAITING : 返回
COMPLETED --> [*] : 退出

@enduml
```

---

## 3.6.1 拖拽操作时序图【时序图 Sequence Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.6.1 拖拽操作流程

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

actor User as U
participant TouchHandler as TH
participant PuzzleGame as PG

U -> TH : touchstart
TH -> TH : 记录位置
U -> TH : touchmove
alt 拖拽
  TH -> TH : 创建拖拽效果
end
U -> TH : touchend
alt 拖拽模式
  TH -> PG : 放置碎片
  PG -> PG : 更新状态
else 点击模式
  TH -> PG : 选中碎片
end

@enduml
```

---

## 3.7.1 系统数据流图【数据流图 Data Flow Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.7.1 系统数据流图

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

top to bottom direction

actor User

User --|> [图片处理] : 上传图片
[图片处理] --|> [拼图生成] : 处理后图片
[拼图生成] --|> [游戏配置] : 保存配置

User --|> [交互处理] : 拖拽操作
[交互处理] --|> [游戏状态] : 更新状态
[游戏状态] --|> [完成检测] : 检测

[完成检测] --|> User : 完成反馈
[完成检测] --|> [历史记录] : 保存记录

@enduml
```

---

## 3.8.1 系统组件依赖关系图【组件图 Component Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.8.1 组件依赖图

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

top to bottom direction

package "界面层" {
  [主页] as HomePage
  [控制页] as ControlPage
  [游戏页] as GamePage
  [完成页] as CompletePage
}

package "逻辑层" {
  [拼图引擎] as PuzzleEngine
  [图像处理] as ImageProcessor
  [交互控制] as TouchHandler
}

package "存储层" {
  [本地存储] as Storage
}

HomePage --|> ControlPage
ControlPage --|> GamePage
GamePage --|> CompletePage

ControlPage --|> ImageProcessor
GamePage --|> PuzzleEngine
GamePage --|> TouchHandler
PuzzleEngine --|> Storage

@enduml
```

---

## 3.3.2 主要类设计【类图 Class Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.3.2 主要类设计

```plantuml
@startuml
!theme plain
skinparam backgroundColor white
skinparam classBackgroundColor #f8f9fa
skinparam classBorderColor #6c757d

class PuzzleGame {
  - originalImage : Image
  - gridSize : int
  - pieceData : Array
  - gameState : string
  + generatePuzzle()
  + checkCompletion()
  + onDragStart()
  + onDragEnd()
}

class ImageProcessor {
  + loadImage(file)
  + sliceImage(image, size)
  + calculateDimensions()
}

class TouchHandler {
  - isDragging : boolean
  - dragStartPos : Object
  + onDragStart(event)
  + onDragMove(event)
  + onDragEnd(event)
}

class MusicPlayer {
  - playlist : Array
  - currentIndex : int
  - isPlaying : boolean
  + play()
  + pause()
  + next()
  + prev()
}

class StorageManager {
  + save(key, data)
  + load(key)
  + clear()
}

class Tutorial {
  - steps : Array
  - currentStep : int
  + showStep(index)
  + nextStep()
  + close()
}

PuzzleGame --> ImageProcessor : uses
PuzzleGame --> TouchHandler : uses
PuzzleGame --> StorageManager : uses
PuzzleGame --> MusicPlayer : uses
PuzzleGame --> Tutorial : uses

@enduml
```

---

## 3.4.2 碎片匹配算法【活动图 Activity Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.4.2 碎片匹配算法

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

start
:获取碎片位置信息;
:读取原始行列坐标;
if (坐标匹配?) then (是)
  if (旋转状态?) then (未旋转)
    :标记为正确位置;
    #c8e6c9:添加correct样式;
  else (已旋转)
    :标记为错误位置;
    #ffcdd2:移除correct样式;
  endif
else (否)
  :标记为错误位置;
  #ffcdd2:移除correct样式;
endif
:更新完成计数;
stop
@enduml
```

---

## 3.4.3 难度词条调度算法【活动图 Activity Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.4.3 难度词条调度算法

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

start
:初始化难度词条;
if (旋转词条?) then (开启)
  :随机选择碎片;
  :设置180度旋转;
endif
if (隐藏词条?) then (开启)
  :随机隐藏部分碎片;
  :设置display:none;
endif
if (捣蛋鬼词条?) then (开启)
  :启动定时器(15-30秒);
  :检测正确放置的碎片;
  :随机移动一个碎片;
endif
stop
@enduml
```

---

## 3.5.2 碎片交互状态机【状态图 State Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.5.2 碎片交互状态机

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

[*] --> 待选中
待选中 --> 选中 : 点击碎片
选中 --> 拖拽 : 触摸移动
选中 --> 待选中 : 点击其他区域
拖拽 --> 放置 : 触摸结束
放置 --> 完成检测 : 碎片到位
完成检测 --> 待选中 : 检测完成
完成检测 --> [*] : 游戏完成

@enduml
```

---

## 3.6.2 碎片放置流程【时序图 Sequence Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.6.2 碎片放置流程

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

actor User as U
participant TouchHandler as TH
participant PuzzleGame as PG
participant GridCell as GC

U -> TH : touchstart
TH -> TH : 记录起始位置
U -> TH : touchmove
TH -> TH : 计算移动距离
alt 超过阈值
  TH -> TH : 开始拖拽模式
end
U -> TH : touchend
TH -> PG : 获取目标格子
PG -> GC : 检查格子状态
alt 格子为空
  PG -> GC : 直接放置碎片
else 格子有碎片
  PG -> PG : 交换碎片位置
end
PG -> PG : 更新游戏状态

@enduml
```

---

## 3.6.3 游戏完成检测流程【活动图 Activity Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.6.3 游戏完成检测流程

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

start
:触发完成检测;
:遍历所有格子;
repeat
  :获取格子中的碎片;
  if (碎片存在?) then (是)
    :检查坐标匹配;
    :检查旋转状态;
    if (位置正确?) then (是)
      :正确计数+1;
    endif
  endif
repeat while (还有格子?)
:检查隐藏碎片;
if (全部正确?) then (是)
  :停止计时器;
  :显示完成界面;
  :保存游戏记录;
  stop
else (否)
  :继续游戏;
  stop
endif
@enduml
```

---

## 3.7.2 用户操作数据流【数据流图 Data Flow Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.7.2 用户操作数据流

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

top to bottom direction

actor User

User --|> [事件捕获] : 用户操作
[事件捕获] --|> [事件分析] : 原始事件
[事件分析] --|> [动作识别] : 事件类型
[动作识别] --|> [状态管理] : 操作指令
[状态管理] --|> [数据更新] : 状态变更
[数据更新] --|> [视图渲染] : 更新数据
[视图渲染] --|> User : 界面反馈

[状态管理] --|> [本地存储] : 持久化

@enduml
```

---

## 3.8.2 模块协作图【组件图 Component Diagram】
**对应位置**：中国大学生计算机设计大赛.md - 3.8.2 模块协作图

```plantuml
@startuml
!theme plain
skinparam backgroundColor white

package "界面层" {
  component [页面管理器] as PageManager
  component [组件渲染器] as ComponentRenderer
}

package "逻辑层" {
  component [游戏引擎] as GameEngine
  component [算法处理器] as AlgorithmProcessor
  component [事件管理器] as EventManager
}

package "存储层" {
  component [缓存管理] as CacheManager
  component [持久化存储] as PersistentStorage
}

' 界面层协作
PageManager --> ComponentRenderer : 渲染请求

' 跨层协作
PageManager --> EventManager : 事件注册
ComponentRenderer --> GameEngine : 状态获取
EventManager --> GameEngine : 事件派发
GameEngine --> AlgorithmProcessor : 算法调用
GameEngine --> CacheManager : 临时存储
CacheManager --> PersistentStorage : 数据持久化

note top of PageManager : 三层架构协作模式\n界面层负责用户交互\n逻辑层处理业务逻辑\n存储层管理数据持久化

@enduml
```

