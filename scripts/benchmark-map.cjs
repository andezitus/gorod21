const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

function measure(source) {
  const context = {window:{},document:{getElementById(){return null;}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'city-data.js'),'utf8'),context);
  vm.runInContext(source,context);
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  vm.runInContext(app.slice(0,app.indexOf('  const statusText'))+'window.benchmarkEvents=events;})();',context);
  const samples = [];
  let svg;
  for(let i=0;i<9;i++){
    const start = performance.now();
    svg = context.window.GorodMapRenderer.drawScene({},context.window.benchmarkEvents,'u1');
    samples.push(performance.now()-start);
  }
  const group = name => {
    const start=new RegExp('<g class="'+name+'"[^>]*>').exec(svg);if(!start)return '';
    const content=start.index+start[0].length,tags=/<\/?g\b[^>]*>/g;tags.lastIndex=content;
    let depth=1,tag;
    while((tag=tags.exec(svg))){depth+=tag[0].startsWith('</')?-1:1;if(!depth)return svg.slice(content,tag.index);}
    return '';
  };
  const paths = s => (s.match(/<path\b/g)||[]).length;
  return {
    firstDrawMs:+samples[0].toFixed(2),
    cachedDrawMedianMs:+samples.slice(1).sort((a,b)=>a-b)[4].toFixed(2),
    svgBytes:Buffer.byteLength(svg),
    svgElements:(svg.match(/<[a-z][a-zA-Z]*\b/g)||[]).length,
    buildingPaths:paths(group('city-buildings')),
    windowPaths:paths(group('city-windows')),
    pipePaths:paths(group('city-pipes')),
    roadPaths:paths(group('city-roads')),
    activeRoadPaths:paths(group('city-active-roads')),
    filteredElements:(svg.match(/filter="url\(/g)||[]).length
  };
}
const result = {};
const compare = process.argv.indexOf('--compare');
if(compare!==-1){
  const ref = process.argv[compare+1];
  if(!ref || !/^[a-zA-Z0-9._/~-]+$/.test(ref))throw new Error('Specify a Git revision after --compare');
  result.baseline=measure(execFileSync('git',['show',`${ref}:map.js`],{cwd:root,encoding:'utf8'}));
}
result.current=measure(fs.readFileSync(path.join(root,'map.js'),'utf8'));
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.stdout.write('Timings measure SVG string construction in Node.js, not browser paint time or FPS.\n');
