import { parseDeck } from "../../src/dsl";
import { initialAssets } from "../../src/examples";
export const exportFixtureAssets = initialAssets;
export const exportFixture = parseDeck(String.raw`
Deck("PPTX 导出对照", author: "数学论坛 · 工程组").transition(.slide, duration: 780, direction: .up)
Theme(material: .glass, font: "Arial", accent: "#23786b")
Slide(title: "中文换行与数学排版", subtitle: "保持文字、表格和公式的空间关系") {
  Split(spacing: 28) {
    VStack(spacing: 18) {
      Text("第一行：中文 English 123，验证字号与行距。\n\n长标识符：AccuracyPreservesWrappingWithoutAutoShrinkAndHandles长中文混排。\n最后一行。").font(25)
      Bullets(["不自动缩小字体", "显式换行和空行", "表格右对齐 0.640"]).font(22).appear(.rise,step:1,duration:600).stagger(130)
    }
    VStack(spacing: 18) {
      Equation(#"\frac{1}{2}\sum_{k=0}^{n} k^2 + \int_0^1 x^2\,dx"#)
      Table(columns:[Column("k",align:.center),Column("x",align:.right,format:"0.000")],rows:[[0,1],[1,0.8],[2,0.64]]).font(18)
    }
  }
}.notes("源码中的备注应保留在 PPTX。")
Slide(title: "毛玻璃采样下层图片", subtitle: "图片、面板、文字保持各自的层级") {
  ZStack {
    Image("assets/convergence.png").frame(x:74,y:250,width:700,height:370)
    Glass {
      Text("玻璃后的图表").font(28)
    }.glass(blur:14,opacity:0.38,radius:20).frame(x:190,y:330,width:400,height:150)
    Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#).frame(x:820,y:300,width:360,height:220)
  }
}.transition(.zoom,duration:440)
Slide(title: "自动、点击、并行与先后", subtitle: "第 1 阶段自动；两次点击依次进入 step 1 与 step 3") {
  Grid(columns:3,spacing:18) {
    Text("自动淡入").font(24).appear(.fade,step:0,delay:120,duration:300)
    Text("向上 30px").font(24).appear(.rise,step:1,order:0,duration:450,easing:.linear)
    Text("左侧 60px").font(24).appear(.slideLeft,step:1,order:0,delay:180,duration:500,easing:.easeInOut)
    Text("随后右侧").font(24).appear(.slideRight,step:1,order:1,delay:100,duration:700,easing:.spring)
    Text("从 88% 缩放").font(24).appear(.zoom,step:3,order:0,duration:800,easing:.spring)
    Text("瞬时显示").font(24).appear(.none,step:3,order:1,delay:50)
  }
}.transition(.none)
`);
