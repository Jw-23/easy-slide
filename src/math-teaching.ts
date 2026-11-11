/** Teaching chapters embedded near the start of the default feature tour. */
export const mathTeachingSlides = String.raw`
// 推荐：教学页用 DynamicSlide；正文用 Text { ... }，不指定固定高度。
DynamicSlide(title: "数学讲解：推荐写法", eyebrow: "数学 / 用法", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 14, showFooter: false) {
    Text {
        **最推荐**：先用单栏自然书写，长证明再设置 columns: 2。
        标题与正文字号统一在页面上设置；内容自己分配高度。
    }
    Code(#"""Deck("题目讲解")
Theme(preset: .paper)
DynamicSlide(title: "非负性", fontSize: 22) {
    Problem("目标") { Text { 设 $x>0$，证明下式。 } }
    Proof {
        Text {
            分母为正，分子是平方。

            $$\frac{(x-1)^2}{x}\ge0$$

            因此结论成立。
        }.indent(2)
    }
}"""#).font(16)
}.notes("推荐从这一页的最小骨架复制开始：Deck 与 Slide 平级；DynamicSlide 负责自然分栏、内容测量与自动续页。单栏适合长公式和连续证明，确认内容适合后再设 columns: 2。正文使用 Text 花括号，源码单换行只是软换行，空一行才显示换行；公式中的换行保留。不为正文写 frame(height:)，也不在自动流中使用 position 或 scale。")

DynamicSlide(title: "题目：倒数之和的最小值", eyebrow: "数学 / 题意与思路", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 16) {
    Problem("先判断最优点，再证明最优值") {
        Text {
            已知 $x>0$，求 $f(x)=x+\frac1x$ 的最小值，
            并说明最小值在哪个 $x$ 处取得。
        }.indent(2)
    }
    Given("不能丢掉的条件") {
        Text {
            $x>0$ 保证分母为正；$x=0$ 不在定义域内。
            **观察**：$f(1)=2$ 只能提出猜想，不能代替全局证明。
        }.indent(2)
    }
    Reasoning("把猜想改写为可验证的目标") {
        Text {
            要证明最小值是 $2$，需要同时完成两件事：
            对每个 $x>0$ 都证明 $f(x)\ge2$，再找到能够取等号的 $x$。

            最直接的做法是研究差值 $f(x)-2$，尝试凑出非负平方。
        }.indent(2)
    }
}.notes("讲解顺序：先读定义域，再算 x=1 提出猜想，强调单个数值只能给出上界，最后把任务拆成全局下界和可达性。题目、已知、推理是语义环境，不要手工做左右栏，后面的解答继续顺着写。")

DynamicSlide(title: "解答：用非负平方完成证明", eyebrow: "数学 / 完整解题", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 14) {
    Solution {
        ProofStep("通分并凑平方") {
            Text {
                从猜测的最小值 $2$ 出发，对任意 $x>0$ 有

                $$x+\frac1x-2=\frac{x^2-2x+1}{x}=\frac{(x-1)^2}{x}.$$
            }.indent(2)
        }.appear(.fade, step: 1, duration: 350)
        ProofStep("证明下界，并检查等号") {
            Text {
                因为 $(x-1)^2\ge0$ 且 $x>0$，上式非负，故 $x+1/x\ge2$。

                等号成立当且仅当 $(x-1)^2=0$，即 $x=1$。
                这个点确实属于定义域，且 $f(1)=2$。
            }.indent(2)
        }.appear(.fade, step: 2, duration: 350)
        Text {
            **答**：最小值为 $2$，在且仅在 $x=1$ 处取得。
        }.appear(.fade, step: 3, duration: 350)
    }
}.notes("每次点击显示一个完整推理单元：恒等变形、下界与等号、最终作答。不要给每一行公式独立设置字号，行间公式随正文保持统一比例。证明内容超出时会自动续页，步骤编号与原始 DSL 的定位仍保持对应。")

DynamicSlide(title: "另一种解法：从导数到全局最优", eyebrow: "数学 / 方法比较", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 14) {
    Derivation("先求驻点") {
        Text {
            在 $(0,+\infty)$ 上，函数可微，且

            $$f'(x)=1-\frac1{x^2},\qquad f'(x)=0\iff x=1.$$

            但**导数为零不等于已经证明最小值**，还需要判断驻点性质。
        }.indent(2)
    }
    Reasoning("用严格凸性排除其他可能") {
        Text {
            对任意 $x>0$，有 $f''(x)=2/x^3>0$，所以 $f$ 在定义域内严格凸。
            凸函数的驻点是全局极小点，严格凸性进一步保证最优点唯一。

            因此 $x=1$ 是唯一的全局极小点，最小值仍为 $2$。
        }.indent(2)
    }
    Text {
        **方法选择**：能直接凑平方时，代数法更短；
        当问题推广为可微凸优化时，导数与凸性提供统一的解释。
    }
}.notes("本页与前一页解同一道题，但解释另一种方法。先找驻点，再给出全局性的依据，避免把一阶必要条件误当成充分条件。下一页继续证明这里用到的凸函数结论，不额外制造左右分栏来割裂定理和证明。")

// 定理后面直接写 Proof；一段较长的正文自然继续，不按视觉列拆成多个证明。
DynamicSlide(title: "定理：凸函数的驻点为何全局最优", eyebrow: "数学 / 定理与证明", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 16) {
    Theorem("一阶充分条件") {
        Text {
            设 $U\subset\mathbb R^n$ 是非空开凸集，$f:U\to\mathbb R$ 可微且凸。
            若 $x^*\in U$ 且 $\nabla f(x^*)=0$，则 $x^*$ 是全局极小点。
        }.indent(2)
    }
    Proof {
        Text {
            任取 $y\in U$ 及 $0<t\le1$。由于定义域是凸集，
            线段上的 $x^*+t(y-x^*)$ 仍属于定义域。由凸性，

            $$f(x^*+t(y-x^*))\le(1-t)f(x^*)+tf(y).$$

            移项并除以正数 $t$，得到

            $$\frac{f(x^*+t(y-x^*))-f(x^*)}{t}\le f(y)-f(x^*).$$

            令 $t\downarrow0$，利用可微性，左端收敛于
            $\langle\nabla f(x^*),y-x^*\rangle=0$。
            所以 $f(y)\ge f(x^*)$。由于 $y$ 任意，结论成立。
        }.indent(2)
    }
    Corollary("严格凸时最优点唯一") {
        Text {
            如果 $f$ 还严格凸，两个不同的极小点的中点将具有更小的函数值，
            与极小性矛盾，故全局极小点至多一个。
        }.indent(2)
    }
}.notes("定理与证明连续书写，先陈述假设再解释每个假设在哪一步使用。正文里多次使用空行分段，单个源码换行保持紧凑。这里不指定固定高度，不需要预先估计证明有多长；自动续页时只有跨物理页才在数学环境标题上显示续。")

// 长证明推荐自然双栏：先填第一栏、再填第二栏、最后自动增加下一页。
DynamicSlide(title: "长证明：梯度下降的精确行为", eyebrow: "数学 / 自然分栏与自动续页", columns: 2, fontSize: 20, titleSize: 28, margin: 24, padding: 6, columnGap: 30, spacing: 16) {
    Theorem("一维二次函数的收敛条件") {
        Text {
            设 $f(x)=x^2/2$，固定步长 $\eta>0$，更新为 $x_{k+1}=x_k-\eta f'(x_k)$。
            对任意初值，当 $0<\eta<2$ 时迭代收敛到唯一极小点 $x^*=0$。

            更精确地，对所有整数 $k\ge1$，都有

            $$x_k=(1-\eta)^k x_0.$$

            $$f(x_k)=(1-\eta)^{2k}f(x_0).$$
        }.indent(2)
    }
    Proof {
        ProofStep("把算法写成线性递推") {
            Text {
                因为 $f'(x)=x$，更新式等价于 $x_{k+1}=(1-\eta)x_k$。
                当 $k=1$ 时显式公式成立；若对 $k$ 成立，再代入递推式，
                就得到 $x_{k+1}=(1-\eta)^{k+1}x_0$。归纳法给出全部迭代值。
            }.indent(2)
        }
        ProofStep("验证函数值公式与极限") {
            Text {
                把显式迭代值代入 $f(x)=x^2/2$，函数值公式随即得到。
                当 $0<\eta<2$ 时有 $|1-\eta|<1$，故 $x_k\to0$ 且 $f(x_k)\to0$。

                这不仅是渐近结论：每一步的误差缩小因子都是 $|1-\eta|$，
                函数值缩小因子则是 $(1-\eta)^2$。
            }.indent(2)
        }
        ProofStep("区分收敛轨迹") {
            Text {
                当 $0<\eta<1$ 时，非零迭代值保持原来的符号，绝对值单调减小。
                当 $\eta=1$ 时，一步就到达 $0$，此后保持不变。

                当 $1<\eta<2$ 时，非零迭代值交替变号，
                但绝对值仍然单调减小。因此，**震荡不一定意味着发散**。
            }.indent(2)
        }
        ProofStep("检查条件的边界") {
            Text {
                以下令 $x_0\ne0$。若 $\eta=0$，迭代停在原点之外的初值；
                若 $\eta=2$，迭代在 $x_0$ 与 $-x_0$ 之间往复；
                若 $\eta>2$，绝对值按大于 $1$ 的因子增长，因而发散。

                所以在正步长范围内，$0<\eta<2$ 正是对所有初值都收敛的条件。
                特别地，$x_0=0$ 时对任何步长都保持在最优点，不能漏掉这个特例。
            }.indent(2)
        }
    }
    Reasoning("从这个例子可以推广什么") {
        Text {
            本题的精确公式依赖于一维二次函数的特殊结构。
            对一般光滑凸函数，需要下降引理等工具；
            **不能**直接把这里的精确等式当成一般函数的公式。

            阅读顺序始终是第一栏、第二栏、下一页。
            继续在 Proof 中写内容即可，不必手动放置左右栏、分隔线或续标题。
        }.indent(2)
    }
}.notes("这是故意写得较长的同一个证明，用来展示内容无法预估时的推荐写法。columns: 2 是自然顺延的内容流，不是左右两份独立材料；公式过长时优先改回 columns: 1 或用 aligned 拆式，而不是放大框或随意缩小每个公式。自动分页会维持字号、证明步骤和 DSL 的来源定位。")

DynamicSlide(title: "迁移练习：把常数换成参数", eyebrow: "数学 / 练习与回顾", fontSize: 22, titleSize: 30, margin: 28, padding: 6, spacing: 16) {
    Problem("先独立完成", number: "练习") {
        Text {
            给定 $a>0$，求 $g(x)=x+a/x$ 在 $x>0$ 上的最小值，
            并给出全部等号条件。
        }.indent(2)
    }
    Reasoning("提示：沿用差值与平方", numbered: false) {
        Text {
            先猜最优点 $x=\sqrt a$，再验证下面的恒等式：

            $$x+\frac ax-2\sqrt a=\frac{(x-\sqrt a)^2}{x}.$$
        }.indent(2)
    }.appear(.fade, step: 1, duration: 350)
    Solution {
        Text {
            因为分母为正且分子非负，最小值为 $2\sqrt a$，
            当且仅当 $x=\sqrt a$ 时取得。

            **回顾**：说明定义域 → 提出猜想 → 证明全局下界 → 验证等号可达。
        }.indent(2)
    }.appear(.fade, step: 2, duration: 350)
}.notes("让学生先独立思考，再点击显示提示与答案。这一页展示如何把同一个讲解模板复用到参数化题目：Problem 陈述目标，Reasoning 给提示，Solution 给完整结论。核心是条件、推理和等号条件完整，动画只用来控制讲解顺序。")
`;
