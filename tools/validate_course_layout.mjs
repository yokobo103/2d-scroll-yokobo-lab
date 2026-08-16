import fs from 'node:fs';
import { composeThreeCourseStage, courseAtX } from '../src/course-layout.js';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const stages = [1, 2, 3].map(index => read(`../data/course-0${index}-objects.json`));
const courseHooks = [1, 2, 3].map(index => read(`../data/course-0${index}-hooks.json`));
const sourceCollision = read('../data/crystal-lab-collision.json');
const layout = read('../data/course-layout.json');
const { stage, hooks, collision } = composeThreeCourseStage(stages, courseHooks, sourceCollision, layout);
const fail = message => { throw new Error(`COURSE LAYOUT: ${message}`); };

if (stage.courses?.length !== 3) fail('3コース構成ではありません');
for (let index = 0; index < 3; index += 1) {
  const course = stage.courses[index];
  if (course.number !== index + 1 || course.xEnd - course.xStart !== layout.courseLength) fail(`${course.id}: コース寸法が不正です`);
  if (stages[index].world.width !== layout.courseLength) fail(`course-0${index + 1}: ローカル座標の幅が不正です`);
  if (index && stage.courses[index - 1].xEnd !== course.xStart) fail(`${course.id}: 境界が不連続です`);
}
if (courseAtX(stage, 100)?.number !== 1 || courseAtX(stage, layout.courseLength + 100)?.number !== 2
  || courseAtX(stage, layout.courseLength * 2 + 100)?.number !== 3) fail('コース判定が不正です');
const lift1 = stage.platforms.find(entity => entity.id === 'c1-exit-lift-01');
const lift2 = stage.platforms.find(entity => entity.id === 'exit-lift-01');
const floor2 = stage.floorBands.find(band => band.id === 'course-2-floor-1');
const floor3 = stage.floorBands.find(band => band.id === 'course-3-floor-1');
if (lift1.y + lift1.motionDistance !== floor2.y || lift2.y + lift2.motionDistance !== floor3.y) fail('下降リフトと次フロアが接地しません');
if (hooks.actorSpawnMarkers.filter(actor => actor.id.startsWith('c1-')).length !== courseHooks[0].actorSpawnMarkers.length) fail('コース1の敵が独立データと一致しません');
if (hooks.actorSpawnMarkers.filter(actor => actor.id.startsWith('c3-')).length !== courseHooks[2].actorSpawnMarkers.length) fail('コース3の敵が独立データと一致しません');
if (layout.tutorialEnemyProgression || layout.bossCourseEnemyProgression || layout.courses.some(course => 'source' in course)) fail('派生指定がcourse-layoutに残っています');
if (collision.killY !== layout.killY || hooks.exitLink.id !== 'c3-exit-lift-01') fail('終端メタデータが不正です');
console.log('PASS three independent local-coordinate courses, offsets, lifts, enemies, and metadata');
console.log('COURSE LAYOUT VALIDATION PASSED');
