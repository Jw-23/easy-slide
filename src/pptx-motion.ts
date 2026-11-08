import { easingProgress, type Cue } from "./motion";
/** Canonical PresentationML click groups, with independent timing for each original scene element. */
export function pptxTiming(
  cues: Cue[],
  ids: (number | null)[],
  textIds: number[] = [],
): string {
  if (!cues.length) return "";
  let id = 2;
  const next = () => ++id;
  const target = (spid: number) =>
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  const ease = (cue: Cue) =>
    `accel="${cue.motion.easing === "easeInOut" ? 50000 : 0}" decel="${cue.motion.easing === "linear" ? 0 : cue.motion.easing === "easeInOut" ? 50000 : 70000}"`;
  const set = (spid: number) =>
    `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${target(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const attribute = (
    cue: Cue,
    spid: number,
    name: string,
    value: (progress: number) => string,
  ) => {
    const samples = cue.motion.easing === "linear" ? 1 : 24;
    const values = Array.from(
      { length: samples + 1 },
      (_, i) =>
        `<p:tav tm="${Math.round((i / samples) * 100000)}"><p:val><p:strVal val="${value(easingProgress(cue.motion.easing, i / samples))}"/></p:val></p:tav>`,
    ).join("");
    return `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${next()}" dur="${Math.max(1, Math.round(cue.motion.duration ?? 600))}" fill="hold"/>${target(spid)}<p:attrNameLst><p:attrName>${name}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>${values}</p:tavLst></p:anim>`;
  };
  const number = (n: number) => {
    const rounded = Math.round(n * 1e9) / 1e9;
    return rounded === 0 ? "0" : rounded.toFixed(9).replace(/\.?0+$/, "");
  };
  const effect = (cue: Cue, spid: number, nodeType: string) => {
    const name = cue.motion.effect;
    const duration =
      name === "none" ? 1 : Math.max(1, Math.round(cue.motion.duration ?? 600));
    let behaviors = set(spid);
    if (name !== "none")
      behaviors += `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${next()}" dur="${duration}" ${ease(cue)}/>${target(spid)}</p:cBhvr></p:animEffect>`;
    if (["rise", "slideLeft", "slideRight"].includes(name)) {
      const axis = name === "rise" ? "ppt_y" : "ppt_x",
        offset =
          name === "rise" ? 30 / 720 : (name === "slideLeft" ? -60 : 60) / 1280;
      behaviors += attribute(
        cue,
        spid,
        axis,
        (p) =>
          `#${axis}${offset * (1 - p) < 0 ? "" : "+"}${number(offset * (1 - p))}`,
      );
    }
    if (name === "zoom")
      for (const axis of ["ppt_w", "ppt_h"])
        behaviors += attribute(
          cue,
          spid,
          axis,
          (p) => `#${axis}*${number(0.88 + 0.12 * p)}`,
        );
    return `<p:par><p:cTn id="${next()}" presetID="${name === "none" ? 1 : name === "zoom" ? 23 : name === "fade" ? 10 : 2}" presetClass="entr" presetSubtype="0" grpId="0" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.round(cue.start)}"/></p:stCondLst><p:childTnLst>${behaviors}</p:childTnLst></p:cTn></p:par>`;
  };
  const animated = new Set<number>();
  const stages = [...new Set(cues.map((c) => c.step))]
    .sort((a, b) => a - b)
    .map((step) => {
      let first = true;
      const content = cues
        .filter((c) => c.step === step)
        .map((c) =>
          [
            ...new Set(
              c.elements
                .map((i) => {
                  if (ids[i] === undefined)
                    throw Error("PPTX 动画目标与场景不匹配");
                  return ids[i];
                })
                .filter((id): id is number => id !== null),
            ),
          ]
            .map((spid) => {
              animated.add(spid);
              const type = first
                ? step === 0
                  ? "afterEffect"
                  : "clickEffect"
                : "withEffect";
              first = false;
              return effect(c, spid, type);
            })
            .join(""),
        )
        .join("");
      if (!content) return "";
      // PowerPoint and Impress expect the zero-delay subgroup between the click stage and its effects.
      return `<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="${step === 0 ? "0" : "indefinite"}"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${content}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    })
    .join("");
  if (!stages) return "";
  const builds = textIds
    .filter((i) => animated.has(i))
    .map(
      (spid) =>
        `<p:bldP spid="${spid}" grpId="0" build="allAtOnce" animBg="1"/>`,
    )
    .join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${stages}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${builds ? `<p:bldLst>${builds}</p:bldLst>` : ""}</p:timing>`;
}
export function shapeIds(xml: string): number[] {
  return [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)]
    .map((m) => Number(m[1]))
    .slice(1);
}
export function sceneShapeIds(xml: string, count: number): (number | null)[] {
  const ids: (number | null)[] = Array(count).fill(null);
  for (const m of xml.matchAll(/<p:cNvPr\b[^>]*>/g)) {
    const id = m[0].match(/\bid="(\d+)"/),
      index = m[0].match(/\bname="easy-slide-element-(\d+)"/);
    if (!id || !index) continue;
    const i = Number(index[1]);
    if (i >= count || ids[i] !== null) throw Error("PPTX 元素映射无效");
    ids[i] = Number(id[1]);
  }
  return ids;
}
