const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/shared/login.js'), 'utf8');

function page(search, reply) {
  const elements = new Map();
  const requests = [];
  const destinations = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value: '', dataset: {}, checked: false});
    return elements.get(id);
  };
  vm.runInNewContext(source, {
    document: {getElementById: element},
    location: {search, origin: 'https://midi.exemplo.com', replace: url => destinations.push(url)},
    fetch: async (url, options) => {
      requests.push({url, options});
      return reply?reply():{ok: true, json: async () => ({user: {id: 'musico'}})};
    },
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout
  });
  return {element, requests, destinations, submit: () => element('auth-form').onsubmit({preventDefault() {}})};
}

test('o link de cadastro abre confirmação e cria a conta somente na origem privada', async () => {
  const {element, requests, destinations, submit} = page('?modo=cadastro');
  assert.equal(element('confirm-row').hidden, false);
  assert.equal(element('confirm-password').required, true);
  assert.equal(element('password').autocomplete, 'new-password');
  assert.equal(requests.length, 0);
  element('username').value = 'musico';
  element('password').value = 'senha-de-teste';
  await submit();
  assert.equal(requests.length, 0);
  element('confirm-password').value = 'senha-de-teste';
  await submit();
  assert.equal(requests[0].url, '/api/auth/register');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].options.body),
    {username: 'musico', password: 'senha-de-teste', remember: false});
  assert.deepEqual(destinations, ['https://midi.exemplo.com/']);
});

test('o link de entrada recupera a sessão existente na origem privada', async () => {
  const {element, requests, destinations} = page('?next=%2F');
  assert.equal(element('confirm-row').hidden, true);
  assert.equal(element('password').autocomplete, 'current-password');
  assert.equal(requests[0].url, '/api/auth/session');
  await Promise.resolve();
  assert.deepEqual(destinations, ['https://midi.exemplo.com/']);
});

test('cadastro fechado permanece na tela de entrada, mesmo com link de cadastro', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'',dataset:{},checked:false});
    return elements.get(id);
  };
  vm.runInNewContext(source, {
    MidiShareConfig:{registration_open:false},
    document:{getElementById:element},
    location:{search:'?modo=cadastro',origin:'https://musica.alwaysdata.net'},
    URL,URLSearchParams
  });
  assert.equal(element('toggle').hidden,true);
  assert.equal(element('registration-notice').hidden,false);
  assert.equal(element('confirm-row').hidden,true);
  assert.equal(element('password').autocomplete,'current-password');
});


test('login malformed response shows a useful error without navigating',async()=>{
  const e=page('',()=>({ok:true,json:async()=>{throw Error('invalid json')}}));
  e.element('username').value='musico';e.element('password').value='senha-do-teste';
  await e.submit();
  assert.match(e.element('auth-status').textContent,/Resposta inválida do servidor/);
  assert.deepEqual(e.destinations,[]);
  assert.equal(e.element('submit').disabled,false);
});
