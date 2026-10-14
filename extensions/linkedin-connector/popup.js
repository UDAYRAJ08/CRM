const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function matchPattern(origin) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

async function currentOrigin() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol) || /(^|\.)linkedin\.com$/.test(u.hostname)) return null;
    return u.origin;
  } catch (_) {
    return null;
  }
}

async function render() {
  const status = await send({ type: 'STATUS' });
  const linked = status?.linked || [];

  $('li-status').innerHTML = status?.loggedIn
    ? '<span><span class="dot ok"></span>Signed in to LinkedIn</span>'
    : '<span><span class="dot warn"></span>Not signed in</span><a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer">Open LinkedIn</a>';

  const origin = await currentOrigin();
  $('site-card').hidden = false;
  if (!origin) {
    // On linkedin.com or a non-web tab: nothing to link here, so say where to go.
    $('site-origin').textContent = linked.length
      ? 'This is not your CRM tab.'
      : 'This is not your CRM tab. The extension is not linked to any CRM yet.';
    $('site-state').textContent = 'Open your CRM in this window, then click this icon again and press "Link this CRM".';
    $('site-btn').hidden = true;
  } else {
    $('site-btn').hidden = false;
  }
  if (origin) {
    const isLinked = linked.includes(origin);
    $('site-origin').textContent = origin;
    $('site-state').innerHTML = isLinked
      ? '<span class="dot ok"></span>Linked'
      : '<span class="dot"></span>Not linked';
    const btn = $('site-btn');
    btn.textContent = isLinked ? 'Unlink' : 'Link this CRM';
    btn.className = isLinked ? 'ghost' : '';
    btn.onclick = async () => {
      btn.disabled = true;
      $('site-msg').textContent = '';
      $('site-msg').className = 'msg';
      try {
        if (isLinked) {
          await send({ type: 'UNLINK_ORIGIN', origin });
        } else {
          // Must run in this click handler: Chrome only shows the prompt on a user gesture.
          // Record the intent first: the prompt can close this popup, and the background
          // finishes the link when Chrome reports the permission was granted.
          await send({ type: 'PREPARE_LINK', origin });
          const granted = await chrome.permissions.request({ origins: [matchPattern(origin)] });
          if (!granted) throw new Error('Permission was not granted.');
          const res = await send({ type: 'LINK_ORIGIN', origin });
          if (!res?.ok) throw new Error(res?.message || res?.error || 'Could not link this site.');
          $('site-msg').textContent = 'Linked. Go back to the CRM and press Connect.';
        }
        await render();
      } catch (err) {
        $('site-msg').textContent = err.message;
        $('site-msg').className = 'msg err';
        btn.disabled = false;
      }
    };
  }

  $('linked-card').hidden = linked.length === 0;
  const list = $('linked-list');
  list.innerHTML = '';
  for (const o of linked) {
    const li = document.createElement('li');
    li.className = 'row';
    const span = document.createElement('span');
    span.className = 'origin';
    span.textContent = o;
    const b = document.createElement('button');
    b.className = 'ghost';
    b.textContent = 'Remove';
    b.onclick = async () => { await send({ type: 'UNLINK_ORIGIN', origin: o }); render(); };
    li.append(span, b);
    list.append(li);
  }
}

render();
