// Names from the user's ITFIT Vault mobility module, retained as stable IDs.
// Source: figofit/itfitweb@3ba8d3569d4e3fa849a685c7b032f6c98dd458d4/vault/mobilita/index.html
export const MOBILITY_EXERCISES=Object.freeze([
  ['hip-raise','Zvedání pánve'],['dead-bug','Mrtvý brouk'],['low-lunge-rotation','Nízký výpad s rotací'],
  ['arms-overhead','Paže nad hlavu'],['birddog','Birddog'],['child-pose','Pozice dítěte'],
  ['side-bend','Úklon do strany'],['fire-hydrant','Fire Hydrant'],['walk-the-dog','Walk the dog'],
  ['forward-fold','Forward Fold'],['half-locust','Poloviční kobylka'],['cobra','Cobra'],
  ['pigeon-pose','Pigeon Pose'],['knees-to-chest','Kolena k hrudi'],['half-plough','Poloviční Pluh'],
  ['lying-rotation','Rotace vleže'],
].map(([id,name])=>Object.freeze({id,name})));
export function mobilityExerciseNames(ids=[]) {
  return ids.map(id=>MOBILITY_EXERCISES.find(exercise=>exercise.id===id)?.name||id.replace(/^custom:/,''));
}
export function validMobilityExercises(ids) {
  return Array.isArray(ids)&&ids.length<=50&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&(MOBILITY_EXERCISES.some(exercise=>exercise.id===id)||id.startsWith('custom:')&&id.slice(7).trim()===id.slice(7)&&id.length>7&&id.length<=107&&!/[\x00-\x1f]/.test(id)));
}
