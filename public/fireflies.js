// Cosmetic lights run independently of turns and survive tile re-rendering.
export function createFireflyLights({random=Math.random,schedule=setTimeout,cancel=clearTimeout,onChange=()=>{}}={}) {
  const lights=new Map();
  const image=lit=>lit?'/art/F-lit.png':'/art/F.png';
  function arm(id,light){
    light.timer=schedule(()=>{
      light.lit=!light.lit;
      onChange(id,image(light.lit));
      arm(id,light);
    },2000+random()*18000);
  }
  return {
    src(id){
      if(!lights.has(id)){const light={lit:false};lights.set(id,light);arm(id,light);}
      return image(lights.get(id).lit);
    },
    clear(){for(const light of lights.values())cancel(light.timer);lights.clear();}
  };
}
