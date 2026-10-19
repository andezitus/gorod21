const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const {workStages,workStory}=vm.runInNewContext(source.slice(source.indexOf('  function workStages('),source.indexOf('  function renderDetail('))+';({workStages,workStory})',{escapeHTML,icon:name=>'<svg data-icon="'+name+'"></svg>'});

test('all active scenarios have exactly one current step with completed and future stages',()=>{
 for(const id of ['u2','g2','a2']){
  const event={id,status:'work'},progress=workStages(event),html=workStory(event);
  assert.equal(progress.steps.length,4);assert(progress.current>0&&progress.current<progress.steps.length);
  assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
  assert.equal((html.match(/class="work-step is-complete"/g)||[]).length,progress.current);
  assert.equal((html.match(/class="work-step is-pending"/g)||[]).length,progress.steps.length-progress.current-1);
  assert(html.includes('Текущий этап'));assert(!html.includes('Стадия планирования'));
 }
});

test('planned scenarios prepend planning and do not mark future work as completed',()=>{
 for(const id of ['u1','g1','u2','g2','a2']){
  const event={id,status:'planned'},progress=workStages(event),html=workStory(event);
  assert.equal(progress.current,0);assert.equal(progress.steps[0][0],'Стадия планирования');
  assert.equal((html.match(/aria-current="step"/g)||[]).length,1);assert(!html.includes('is-complete'));
  assert.equal(progress.steps.length,workStages({id,status:'work'}).steps.length+1);
 }
});

test('water and road navigation is separate from progress, and finished events show no active timeline',()=>{
 for(const [id,target] of [['g1','u1'],['u1','g1']]){
  const html=workStory({id,status:'planned',story:true});
  assert(html.includes('>Ход работ</h4>'));assert(!html.includes('3 связанных этапа'));assert(!html.includes('Одна проблема'));
  assert(html.indexOf('</ol>')<html.indexOf('data-go-event="'+target+'"'));
  assert(!html.slice(html.indexOf('<ol'),html.indexOf('</ol>')).includes('<button'));
 }
 assert.equal(workStory({id:'a1',status:'done'}),'');assert.equal(workStages({id:'unknown',status:'work'}),null);
 assert(!source.includes('Событие и сроки не подтверждены городскими службами. Сведения об организации'));
});
