import type { Block } from "./dsl";
export const mathEnvironments = {
  Definition: "定义",
  Theorem: "定理",
  Lemma: "引理",
  Proposition: "命题",
  Corollary: "推论",
  Problem: "题目",
  Given: "已知",
  Solution: "解答",
  Proof: "证明",
  Derivation: "推导",
  Reasoning: "推理",
  ProofStep: "步骤",
} as const;
export type MathEnvironment = keyof typeof mathEnvironments;
export function isMathEnvironment(name: string): name is MathEnvironment {
  return Object.hasOwn(mathEnvironments, name);
}
const numbered = new Set<MathEnvironment>([
  "Definition",
  "Theorem",
  "Lemma",
  "Proposition",
  "Corollary",
  "Problem",
  "ProofStep",
]);
export function mathHeading(block: Block): string {
  const name = block.environment || "Theorem";
  return (
    mathEnvironments[name] +
    (block.displayNumber ? " " + block.displayNumber : "") +
    (block.title ? " · " + block.title : "") +
    (block.continued ? "（续）" : "")
  );
}
export function numberMath(
  blocks: Block[],
  counters: Map<string, number>,
  proof = { value: 0 },
): Block[] {
  return blocks.map((b) => {
    let displayNumber: string | undefined;
    if (
      b.type === "math" &&
      b.environment &&
      numbered.has(b.environment) &&
      b.numbered !== false
    ) {
      const n =
        b.environment === "ProofStep"
          ? ++proof.value
          : (counters.get(b.environment) || 0) + 1;
      if (b.environment !== "ProofStep") counters.set(b.environment, n);
      displayNumber = String(b.number ?? n);
    }
    return {
      ...b,
      ...(displayNumber ? { displayNumber } : {}),
      ...(b.children
        ? {
            children: numberMath(
              b.children,
              counters,
              b.environment === "Proof" || b.environment === "Solution"
                ? { value: 0 }
                : proof,
            ),
          }
        : {}),
    };
  });
}
export function proofEnds(block: Block) {
  return block.environment === "Proof" && block.qed !== false;
}
