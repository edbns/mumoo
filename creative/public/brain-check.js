const status = document.querySelector('#status');
const controls = document.querySelector('#controls');
const output = document.querySelector('#result');
const form = document.querySelector('#access');
let token;

async function unlock() {
  status.textContent = 'Preparing staging access…';
  token = undefined;
  controls.hidden = true;
  try {
    const response = await fetch('/api/brain-tester-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Access could not be verified.');
    token = (await response.json()).token;
    controls.hidden = false;
    status.textContent = 'Access enabled for 15 minutes.';
  } catch {
    status.textContent = 'Access could not be verified.';
  }
}

if (form) {
  form.hidden = true;
  void unlock();
}

for (const [id, videoType] of [['lyric', 'lyric'], ['visual', 'visual']]) {
  document.querySelector(`#${id}`)?.addEventListener('click', async () => {
    output.textContent = 'Checking recommendations…';
    try {
      const response = await fetch('/api/brain-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token },
        body: JSON.stringify({ version: 1, videoType, primaryGenre: 'Deep House' }),
      });
      if (!response.ok) throw new Error('Request failed.');
      const result = await response.json();
      output.textContent = `${result.eligibleCount} eligible compositions\n${result.recommendations.map(item => `${item.name}: ${item.explanation}`).join('\n')}`;
    } catch {
      output.textContent = 'The test could not be completed. Check access and try again.';
    }
  });
}
