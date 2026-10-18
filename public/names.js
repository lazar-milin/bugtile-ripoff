export const COLOURS=['Amber','Azure','Bronze','Coral','Indigo','Ivory','Jade','Mint','Ochre','Rose','Silver','Teal'];
export const NAME_BUGS=['Dragonfly','Katydid','Moth','Cricket','Cicada','Earwig','Lacewing','Silverfish','Termite','Mayfly','Caddisfly','Damselfly'];
export function randomName(exclude=[],random=Math.random){
  const candidates=COLOURS.flatMap(c=>NAME_BUGS.map(b=>`${c} ${b}`)).filter(n=>!exclude.includes(n));
  return candidates[Math.floor(random()*candidates.length)];
}
