import test from 'node:test';
import assert from 'node:assert/strict';
import {EXERCISE_CATALOG,exerciseLibrary} from '../domain.mjs';
import {PROGRAMS,programSettings,programDays,chooseProgram,swapProgramExercise} from '../program.mjs';
import {personalSettings} from '../personal.mjs';

test('every program slot starts with a catalog exercise of the same movement pattern',()=>{
  for(const program of PROGRAMS)for(const day of program.days)for(const slot of day.slots){
    const exercise=EXERCISE_CATALOG.find(item=>item.id===slot.exercise);
    assert.ok(exercise,`${program.id}/${day.key}: ${slot.exercise}`);assert.equal(exercise.pattern,slot.pattern);
  }
});

test('choosing, swapping and resetting a program keeps only real, same-pattern choices',()=>{
  const library=exerciseLibrary({});
  let settings=chooseProgram({},'ab','2026-11-13');
  assert.deepEqual(settings.trainingProgram,{id:'ab',since:'2026-11-13',choices:{}});
  settings=swapProgramExercise(settings,'a',2,'cable-row',library);
  assert.deepEqual(settings.trainingProgram.choices,{a:[null,null,'cable-row',null]});
  assert.equal(programDays(settings,library).days[0].slots[2].exercise.id,'cable-row');
  assert.throws(()=>swapProgramExercise(settings,'a',2,'goblet-squat',library));
  settings=swapProgramExercise(settings,'a',2,'band-row',library);
  assert.deepEqual(settings.trainingProgram.choices,{});
  assert.deepEqual(personalSettings({trainingProgram:settings.trainingProgram}).trainingProgram,settings.trainingProgram);
  assert.equal(personalSettings({}).trainingProgram,null);
});

test('invalid programs are rejected and a vanished choice falls back to the default exercise',()=>{
  assert.throws(()=>programSettings({id:'nope',since:'2026-11-13',choices:{}}));
  assert.throws(()=>programSettings({id:'ab',since:'2026-11-13',choices:{a:['x']}}));
  const view=programDays({trainingProgram:{id:'ab',since:'2026-11-13',choices:{a:[null,null,'custom-gone',null]}}},exerciseLibrary({}));
  assert.equal(view.days[0].slots[2].exercise.id,'band-row');
});

test('Olda keeps the original catalog; atlas and machine exercises are marked extended',()=>{
  assert.equal(EXERCISE_CATALOG.filter(exercise=>!exercise.extended).length,24);
  assert.ok(EXERCISE_CATALOG.some(exercise=>exercise.extended&&exercise.equipment.includes('machine')));
});
