const form = document.querySelector('#access');
const password = document.querySelector('#password');
const status = document.querySelector('#status');
const controls = document.querySelector('#controls');
const output = document.querySelector('#result');
let token;
form.addEventListener('submit', async event => {
  event.preventDefault(); status.textContent = 'Checking access…'; token = undefined; controls.hidden = true;
  try {
    const response = await fetch('/api/brain-tester-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password.value }) });
    password.value = '';
    if (!response.ok) throw new Error('Access could not be verified.');
    token = (await response.json()).token; controls.hidden = false; status.textContent = 'Access enabled for 15 minutes.';
  } catch { password.value = ''; status.textContent = 'Access could not be verified.'; }
});
for (const [id, videoType] of [['lyric', 'lyric'], ['visual', 'visual']]) document.querySelector(`#${id}`).addEventListener('click', async () => {
  output.textContent = 'Checking recommendations…';
  try {
    const response = await fetch('/api/brain-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: JSON.stringify({ version: 1, videoType, primaryGenre: 'Deep House' }) });
    if (!response.ok) throw new Error('Request failed.');
    const result = await response.json();
    output.textContent = `${result.eligibleCount} eligible compositions\n${result.recommendations.map(item => `${item.name}: ${item.explanation}`).join('\n')}`;
  } catch { output.textContent = 'The test could not be completed. Check access and try again.'; }
});
