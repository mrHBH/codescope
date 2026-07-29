import { WindgraphSceneBoard } from './src/playground/boards/windgraphScene';
import { graphTheoryDoc } from './src/playground/windgraphWorld';

const fakeFont = { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }), getKerningValue: () => 0 } as any;
const atlas = { table: {} } as any;

const b = new WindgraphSceneBoard(graphTheoryDoc());
b.ensure();
const scene = (b as any).scene;
const group = (scene.mobjects as Map<string, any>).get('petersen-bfs');
console.log('group children:', group.children.length);
const c0 = group.children[0];
console.log('child0 ctor:', c0.constructor.name, 'visible:', c0.visible, 'opacity:', c0.opacity, 'reveal:', c0.reveal);
console.log('child0 a:', c0.a, 'b:', c0.b, 'points:', c0.points);
const ops = c0.build ? c0.build() : '(no build)';
console.log('child0 build ops:', JSON.stringify(ops).slice(0, 200));

const scratch = { inst: [] as number[], crv: new Array(60).fill(0), rws: new Array(50).fill(0), font: fakeFont, atlas };
group.emit(scratch as any);
console.log('direct group.emit -> inst:', scratch.inst.length);
