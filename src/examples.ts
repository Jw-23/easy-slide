import type { Deck } from "./dsl";
import { serialize } from "./dsl";
export const mathDeck: Deck = {
  version: 1,
  title: "从局部，到无限",
  author: "林知远 · 数学论坛",
  theme: {
    accent: "#16766d",
    background: "#fafbf9",
    color: "#192c2a",
    font: "Arial",
  },
  transition: "slide",
  duration: 650,
  slides: [
    {
      layout: "cover",
      eyebrow: "MATHEMATICS COLLOQUIUM  /  2026",
      title: "从局部，\n到无限。",
      subtitle: "一个关于梯度、收敛与最优解的故事",
      notes: "先用一个直观问题引入：沿着坡度下降，最终会抵达哪里？",
      blocks: [
        {
          type: "text",
          text: "林知远  /  应用数学研究组\n2026 年秋季 · 学术交流",
          size: 18,
        },
        { type: "equation", text: "x_{k+1}=x_k-\\eta\\nabla f(x_k)" },
      ],
    },
    {
      layout: "section",
      eyebrow: "01 / THE QUESTION",
      title: "复杂的问题，\n从一个简单的方向开始。",
      subtitle: "为什么局部信息，能够引导我们走向全局最优？",
      blocks: [],
    },
    {
      layout: "split",
      eyebrow: "02 / INTUITION",
      title: "每一步，都更接近答案",
      subtitle: "将几何直觉转化为可计算的迭代",
      blocks: [
        {
          type: "bullets",
          title: "从直觉出发",
          items: [
            "梯度给出局部上升最快的方向",
            "向反方向迈出一小步",
            "步长决定收敛的速度与稳定性",
          ],
        },
        {
          type: "equation",
          title: "迭代规则",
          text: "x_{k+1}=x_k-\\eta\\nabla f(x_k)",
          step: 1,
        },
      ],
    },
    {
      layout: "content",
      eyebrow: "03 / THEOREM",
      title: "光滑凸函数的收敛保证",
      subtitle: "假设 f 为凸函数，且梯度满足 L-Lipschitz 连续",
      blocks: [
        {
          type: "vstack",
          gap: 24,
          children: [
            {
              type: "equation",
              text: "f(x_k)-f(x^*)\\leq\\frac{\\lVert x_0-x^*\\rVert^2}{2\\eta k}",
            },
            {
              type: "text",
              title: "定理的含义",
              text: "当步长 η ≤ 1/L 时，目标函数值以 O(1/k) 的速率逼近最优值。局部的一阶信息，足以带来全局的收敛保证。",
              step: 1,
            },
          ],
        },
      ],
    },
    {
      layout: "compare",
      eyebrow: "04 / A CLOSER LOOK",
      title: "选择合适的步长",
      subtitle: "速度和稳定性之间的平衡",
      blocks: [
        {
          type: "bullets",
          title: "固定步长",
          items: [
            "实现简单，便于理论分析",
            "需要估计光滑常数 L",
            "适合结构明确的优化问题",
          ],
        },
        {
          type: "bullets",
          title: "回溯线搜索",
          items: [
            "根据局部曲率自适应调整",
            "减少对先验常数的依赖",
            "每步需要额外函数计算",
          ],
        },
      ],
    },
    {
      layout: "grid",
      eyebrow: "05 / TAKEAWAYS",
      title: "带走三个关键想法",
      subtitle: "局部信息、步长与全局保证",
      blocks: [
        {
          type: "metric",
          value: "01",
          title: "局部信息",
          text: "梯度是方向，不是终点。",
        },
        {
          type: "metric",
          value: "02",
          title: "适当步长",
          text: "稳定的进展比冒进更有效。",
        },
        {
          type: "metric",
          value: "03",
          title: "全局保证",
          text: "结构让收敛成为可能。",
        },
      ],
    },
    {
      layout: "section",
      eyebrow: "LET’S DISCUSS",
      title: "下一个问题，\n由你提出。",
      subtitle: "感谢聆听 · 欢迎交流",
      blocks: [
        { type: "text", text: "讨论：当凸性不再成立，我们还能保证什么？" },
      ],
    },
  ],
};
export const engineeringDeck: Deck = {
  version: 1,
  title: "把想法，交付为现实",
  author: "工程平台组",
  theme: { accent: "#4269d0", background: "#f8faff", color: "#1b2740" },
  transition: "fade",
  duration: 550,
  slides: [
    {
      layout: "cover",
      eyebrow: "ENGINEERING REVIEW / Q4 2026",
      title: "把想法，\n交付为现实。",
      subtitle: "平台性能与可靠性 · 阶段工程汇报",
      blocks: [{ type: "text", text: "工程平台组 / 2026.11", size: 18 }],
    },
    {
      layout: "grid",
      eyebrow: "01 / OVERVIEW",
      title: "用结果，衡量进展",
      subtitle: "以下为演示数据，请替换为实际项目指标",
      blocks: [
        {
          type: "metric",
          value: "−42%",
          label: "P95 响应耗时",
          text: "缓存与查询链路优化",
        },
        {
          type: "metric",
          value: "99.95%",
          label: "服务可用性",
          text: "过去 30 天统计窗口",
        },
        {
          type: "metric",
          value: "3.2×",
          label: "构建吞吐量",
          text: "任务编排与增量构建",
        },
      ],
    },
    {
      layout: "split",
      title: "从瓶颈，到改进",
      eyebrow: "02 / APPROACH",
      blocks: [
        {
          type: "bullets",
          title: "我们遇到的问题",
          items: [
            "高峰时段排队时间增长",
            "慢查询影响核心接口",
            "部署回滚依赖人工操作",
          ],
        },
        {
          type: "bullets",
          title: "已经落地的方案",
          items: [
            "分级队列与弹性并发",
            "热点缓存与索引治理",
            "自动化灰度与健康检查",
          ],
          step: 1,
        },
      ],
    },
    {
      layout: "timeline",
      title: "每个里程碑，都有可交付成果",
      eyebrow: "03 / ROADMAP",
      blocks: [
        {
          type: "text",
          title: "11 月 · 基线",
          text: "完成指标采集与性能基准。",
        },
        {
          type: "text",
          title: "12 月 · 优化",
          text: "上线缓存策略和异步任务。",
        },
        {
          type: "text",
          title: "01 月 · 验证",
          text: "压测、故障演练与容量评估。",
        },
      ],
    },
    {
      layout: "content",
      title: "风险透明，决策明确",
      eyebrow: "04 / DECISIONS",
      blocks: [
        {
          type: "table",
          rows: [
            ["事项", "影响", "下一步"],
            ["缓存一致性", "短时数据延迟", "引入版本校验"],
            ["流量增长", "资源成本上升", "建立容量预警"],
            ["跨团队依赖", "交付时间不确定", "每周同步接口契约"],
          ],
        },
      ],
    },
    {
      layout: "section",
      title: "让下一次交付，\n更从容。",
      subtitle: "讨论与反馈",
      eyebrow: "THANK YOU",
      blocks: [],
    },
  ],
};
// Demonstrate parallel and sequential entrances without requiring nested wrappers.
mathDeck.slides[2].blocks[0].stagger = 120;
mathDeck.slides[2].blocks[0].appear = {
  effect: "rise",
  duration: 500,
  easing: "easeOut",
};
mathDeck.slides[2].blocks[1].appear = {
  effect: "zoom",
  delay: 150,
  duration: 700,
  easing: "easeOut",
};
mathDeck.slides[5].blocks.forEach((b, i) => {
  b.step = 1;
  b.appear = {
    effect: "rise",
    order: i,
    duration: 500,
    delay: i === 0 ? 0 : 100,
    easing: "easeOut",
  };
});
engineeringDeck.slides[1].blocks.forEach((b, i) => {
  b.appear = { effect: "rise", order: i, duration: 450, easing: "easeOut" };
});
export const initialSource = serialize(mathDeck);
