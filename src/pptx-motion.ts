import type { Cue } from "./motion";
/** Native DrawingML timing tree: one click sequence per DSL stage, one common start time per cue. */
export function pptxTiming(cues: Cue[], shapeIds: number[]): string {
  if (!cues.length) return "";
  let id = 2;
  const nextId = () => ++id;
  const target = (spid: number) =>
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  const node = (cue: Cue, spid: number) => {
    const effect = cue.motion.effect,
      filter = {
        fade: "fade",
        rise: "slide(fromBottom)",
        slideLeft: "slide(fromLeft)",
        slideRight: "slide(fromRight)",
        zoom: "zoom(in)",
        none: "fade",
      }[effect];
    const duration =
        effect === "none" ? 1 : Math.max(1, cue.motion.duration ?? 600),
      decel =
        cue.motion.easing === "linear"
          ? 0
          : cue.motion.easing === "easeInOut"
            ? 50000
            : 70000,
      accel = cue.motion.easing === "easeInOut" ? 50000 : 0;
    const behaviorId = nextId(),
      setId = nextId(),
      effectId = nextId();
    return `<p:par><p:cTn id="${behaviorId}" presetID="${effect === "zoom" ? 23 : effect === "fade" ? 10 : 2}" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect"><p:stCondLst><p:cond delay="${cue.start}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${target(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${effectId}" dur="${duration}" accel="${accel}" decel="${decel}"/>${target(spid)}</p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
  };
  const stages = [...new Set(cues.map((c) => c.step))]
    .sort((a, b) => a - b)
    .map((step) => {
      const groupId = nextId();
      const content = cues
        .filter((c) => c.step === step)
        .flatMap((c) =>
          c.elements.map((i) => {
            const spid = shapeIds[i];
            if (spid === undefined) throw Error("PPTX 动画目标与场景不匹配");
            return node(c, spid);
          }),
        )
        .join("");
      return `<p:par><p:cTn id="${groupId}" fill="hold"><p:stCondLst><p:cond delay="${step === 0 ? "0" : "indefinite"}"/></p:stCondLst><p:childTnLst>${content}</p:childTnLst></p:cTn></p:par>`;
    })
    .join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${stages}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}
export function shapeIds(xml: string): number[] {
  return [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)]
    .map((x) => Number(x[1]))
    .slice(1);
}
