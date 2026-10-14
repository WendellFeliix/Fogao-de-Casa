'use strict';

// =========================================
// FOGÃO DE CASA — lógica do app
// API pública: TheMealDB (https://www.themealdb.com/api.php)
// =========================================

// ---------- Constantes ----------
const API = 'https://www.themealdb.com/api/json/v1/1';
const STORAGE_KEY = 'fogao-favoritos';
const ALL = 'Todas';                       // nome da categoria "sem filtro"
const INITIAL_LETTERS = ['a', 'b', 'c'];   // a API não tem "listar tudo": juntamos algumas letras
const SEARCH_DEBOUNCE_MS = 350;            // espera após o usuário parar de digitar

// ---------- Estado da aplicação ----------
const state = {
  view: 'todas',          // 'todas' | 'favoritas'
  category: ALL,
  query: '',
  meals: [],              // resultado atual em exibição (aba "Todas")
  favorites: loadFavorites(),
};

// ---------- Referências do DOM ----------
const grid = document.getElementById('recipeGrid');
const emptyState = document.getElementById('emptyState');
const emptyTitle = emptyState.querySelector('.empty-title');
const emptySub = emptyState.querySelector('.empty-sub');
const searchInput = document.getElementById('searchInput');
const categoryChips = document.getElementById('categoryChips');
const favCount = document.getElementById('favCount');
const overlay = document.getElementById('modalOverlay');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModalBtn');

// Textos padrão do estado vazio (restaurados depois de uma mensagem de erro)
const EMPTY_DEFAULT = {
  title: emptyTitle.textContent,
  sub: emptySub.textContent,
};

// =========================================
// Utilitários
// =========================================

/**
 * Escapa caracteres especiais de HTML.
 * Todo texto vindo da API ou do localStorage passa por aqui antes de ir
 * para o innerHTML, evitando injeção de HTML/JS (XSS).
 */
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Faz uma requisição GET e devolve o JSON.
 * Lança erro se a resposta não for 2xx (o fetch sozinho não faz isso).
 */
async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  return res.json();
}

// Controla a busca "em andamento" da listagem para evitar respostas fora de ordem
let listController = null;

/**
 * Cancela a requisição anterior da listagem e prepara uma nova.
 * Sem isso, uma resposta lenta e antiga poderia sobrescrever a mais recente.
 * Retorna o signal que deve ser passado ao fetch.
 */
function startListRequest() {
  if (listController) listController.abort();
  listController = new AbortController();
  return listController.signal;
}

// =========================================
// Favoritos (localStorage)
// =========================================

/**
 * Lê os favoritos salvos no navegador.
 * Se o dado estiver corrompido ou o storage estiver indisponível,
 * volta a um objeto vazio em vez de quebrar o app inteiro.
 */
function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Salva os favoritos no localStorage e atualiza o contador da aba.
 */
function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.favorites));
  } catch (err) {
    console.warn('Não foi possível salvar os favoritos:', err);
  }
  favCount.textContent = Object.keys(state.favorites).length;
}

/**
 * Adiciona ou remove uma receita dos favoritos.
 * Guarda só o necessário para desenhar o card depois.
 * Retorna true se a receita ficou favoritada.
 */
function toggleFavorite(meal) {
  const isNowFav = !state.favorites[meal.idMeal];

  if (isNowFav) {
    state.favorites[meal.idMeal] = {
      idMeal: meal.idMeal,
      strMeal: meal.strMeal,
      strMealThumb: meal.strMealThumb,
      strCategory: meal.strCategory || '',
      strArea: meal.strArea || '',
    };
  } else {
    delete state.favorites[meal.idMeal];
  }

  saveFavorites();
  return isNowFav;
}

// =========================================
// Abas e chips (estado visual)
// =========================================

/**
 * Marca visualmente a aba ativa ('todas' ou 'favoritas').
 * Também atualiza aria-pressed para leitores de tela.
 */
function setActiveTab(view) {
  document.querySelectorAll('.tab').forEach(tab => {
    const active = tab.dataset.tab === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
}

/**
 * Marca visualmente o chip de categoria ativo.
 * Passe null para desmarcar todos (ex.: durante uma busca por texto).
 */
function setActiveChip(category) {
  document.querySelectorAll('.chip').forEach(chip => {
    const active = chip.dataset.category === category;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

// =========================================
// Renderização da lista
// =========================================

/**
 * Mostra cards "esqueleto" enquanto a API responde.
 */
function renderSkeletons(count = 8) {
  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'true');
  emptyState.hidden = true;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'card skeleton';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="card-media"></div>
      <div class="card-body">
        <div class="card-cat">&nbsp;</div>
        <div class="card-title">&nbsp;</div>
        <div class="card-area">&nbsp;</div>
      </div>`;
    grid.appendChild(el);
  }
}

/**
 * Mostra o bloco de "estado vazio" com um título e um subtítulo.
 * Serve tanto para "nenhum resultado" quanto para mensagens de erro.
 */
function showMessage(title, sub) {
  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'false');
  emptyTitle.textContent = title;
  emptySub.textContent = sub;
  emptyState.hidden = false;
}

/**
 * Cria o elemento (card) de uma receita, já com os eventos ligados.
 * O título é um <button> de verdade: assim o card abre pelo teclado
 * e o clique no card inteiro funciona via CSS (::after).
 */
function createCard(meal) {
  const isFav = !!state.favorites[meal.idMeal];
  const card = document.createElement('article');
  card.className = 'card';

  card.innerHTML = `
    <div class="card-media">
      <img src="${escapeHTML(meal.strMealThumb)}/preview" alt="${escapeHTML(meal.strMeal)}" loading="lazy">
      <button type="button" class="card-fav ${isFav ? 'is-fav' : ''}"
              aria-pressed="${isFav}" aria-label="Favoritar ${escapeHTML(meal.strMeal)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 21s-7-4.35-9.5-8.5C.7 9 2 5.5 5.5 5c2-.3 3.5 1 4.5 2.3C11 6 12.5 4.7 14.5 5 18 5.5 19.3 9 17.5 12.5 15 16.65 12 21 12 21z"/>
        </svg>
      </button>
    </div>
    <div class="card-body">
      <span class="card-cat">${escapeHTML(meal.strCategory)}</span>
      <h3 class="card-title"><button type="button" class="card-open">${escapeHTML(meal.strMeal)}</button></h3>
      ${meal.strArea ? `<p class="card-area">Cozinha ${escapeHTML(meal.strArea)}</p>` : ''}
    </div>`;

  // Favoritar
  const favBtn = card.querySelector('.card-fav');
  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(meal);
    favBtn.classList.toggle('is-fav', nowFav);
    favBtn.setAttribute('aria-pressed', String(nowFav));

    // Na aba "Favoritas", desfavoritar já tira o card da tela
    if (state.view === 'favoritas') renderGrid(Object.values(state.favorites));
  });

  // Abrir detalhes
  card.querySelector('.card-open').addEventListener('click', () => openDetail(meal.idMeal));

  return card;
}

/**
 * Desenha a lista de receitas na tela.
 * Se a lista vier vazia, mostra a mensagem de "nenhuma receita".
 */
function renderGrid(meals) {
  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'false');

  if (!meals || meals.length === 0) {
    const inFavorites = state.view === 'favoritas';
    showMessage(
      inFavorites ? 'Você ainda não favoritou nada' : EMPTY_DEFAULT.title,
      inFavorites ? 'Toque no coração de uma receita para guardá-la aqui.' : EMPTY_DEFAULT.sub
    );
    return;
  }

  emptyState.hidden = true;
  const fragment = document.createDocumentFragment(); // um único reflow no DOM
  meals.forEach(meal => fragment.appendChild(createCard(meal)));
  grid.appendChild(fragment);
}

// =========================================
// Chamadas à API (listagem)
// =========================================

/**
 * Carrega as categorias e cria os chips de filtro.
 * Se falhar, avisa o usuário em vez de deixar a área vazia.
 */
async function loadCategories() {
  try {
    const data = await fetchJSON(`${API}/categories.php`);
    const names = data.categories.map(c => c.strCategory);

    categoryChips.innerHTML = '';
    [ALL, ...names].forEach(name => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.category = name;
      chip.textContent = name;
      chip.addEventListener('click', () => selectCategory(name));
      categoryChips.appendChild(chip);
    });
    setActiveChip(state.category);
  } catch (err) {
    console.error(err);
    categoryChips.innerHTML = '<span class="chips-error">Não foi possível carregar as categorias.</span>';
  }
}

/**
 * Trata o clique em um chip: limpa a busca, volta para a aba "Todas"
 * e carrega as receitas da categoria escolhida.
 */
function selectCategory(name) {
  state.category = name;
  state.query = '';
  state.view = 'todas';
  searchInput.value = '';
  setActiveChip(name);
  setActiveTab('todas');
  loadMeals(name);
}

/**
 * Trata erros de requisição da listagem.
 * Requisições canceladas (AbortError) são esperadas e ignoradas.
 */
function handleListError(err) {
  if (err.name === 'AbortError') return;
  console.error(err);
  state.meals = [];
  showMessage('Não deu para carregar as receitas', 'Confira sua conexão e tente de novo em instantes.');
}

/**
 * Busca as receitas de uma categoria (ou uma seleção geral em "Todas").
 * - "Todas": a API não oferece "listar tudo", então combinamos algumas letras.
 * - Categoria: o endpoint /filter não devolve a categoria no item,
 *   então preenchemos aqui para o card não ficar sem rótulo.
 */
async function loadMeals(category) {
  const signal = startListRequest();
  renderSkeletons();

  try {
    let meals;

    if (category === ALL) {
      const results = await Promise.all(
        INITIAL_LETTERS.map(letter => fetchJSON(`${API}/search.php?f=${letter}`, signal))
      );
      meals = results.flatMap(r => r.meals || []);
    } else {
      const data = await fetchJSON(`${API}/filter.php?c=${encodeURIComponent(category)}`, signal);
      meals = (data.meals || []).map(m => ({ ...m, strCategory: category }));
    }

    state.meals = meals;
    renderGrid(meals);
  } catch (err) {
    handleListError(err);
  }
}

/**
 * Busca receitas pelo nome digitado.
 * Termo vazio = volta para a listagem geral.
 */
async function runSearch(term) {
  state.query = term;
  state.view = 'todas';
  setActiveTab('todas');

  if (!term) {
    state.category = ALL;
    setActiveChip(ALL);
    loadMeals(ALL);
    return;
  }

  setActiveChip(null); // busca por texto ignora a categoria
  const signal = startListRequest();
  renderSkeletons(4);

  try {
    const data = await fetchJSON(`${API}/search.php?s=${encodeURIComponent(term)}`, signal);
    state.meals = data.meals || [];
    renderGrid(state.meals);
  } catch (err) {
    handleListError(err);
  }
}

// =========================================
// Eventos: busca e abas
// =========================================

// Debounce: só dispara a busca quando o usuário para de digitar
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const term = searchInput.value.trim();
  searchTimeout = setTimeout(() => runSearch(term), SEARCH_DEBOUNCE_MS);
});

// Troca entre "Todas" e "Favoritas"
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.tab;
    setActiveTab(state.view);
    renderGrid(state.view === 'favoritas' ? Object.values(state.favorites) : state.meals);
  });
});

// =========================================
// Modal de detalhe
// =========================================

let lastFocusedElement = null; // para devolver o foco ao fechar
let detailRequestId = 0;       // descarta respostas de aberturas antigas

/**
 * Extrai os ingredientes de uma receita.
 * A API entrega em campos numerados (strIngredient1..20 / strMeasure1..20),
 * então juntamos tudo em uma lista de { name, measure }.
 */
function getIngredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) list.push({ name: name.trim(), measure: (measure || '').trim() });
  }
  return list;
}

/**
 * Monta o HTML do modal com os dados completos da receita.
 */
function renderDetail(meal) {
  const ingredients = getIngredients(meal);

  modalBody.innerHTML = `
    <img class="modal-hero" src="${escapeHTML(meal.strMealThumb)}" alt="${escapeHTML(meal.strMeal)}">
    <div class="modal-content">
      <span class="modal-cat">${escapeHTML(meal.strCategory)}</span>
      <h2 class="modal-title" id="modalTitle">${escapeHTML(meal.strMeal)}</h2>
      ${meal.strArea ? `<p class="modal-area">Cozinha ${escapeHTML(meal.strArea)}</p>` : ''}

      <h3 class="modal-section-title">Ingredientes</h3>
      <ul class="ingredient-list">
        ${ingredients.map(i => `<li><span>${escapeHTML(i.name)}</span><span class="ingredient-amount">${escapeHTML(i.measure)}</span></li>`).join('')}
      </ul>

      <h3 class="modal-section-title">Modo de preparo</h3>
      <p class="instructions">${escapeHTML(meal.strInstructions)}</p>
    </div>`;
}

/**
 * Abre o modal, busca os detalhes da receita e os exibe.
 * Guarda o elemento que tinha foco para devolvê-lo ao fechar
 * e trava o scroll da página enquanto o modal está aberto.
 */
async function openDetail(id) {
  const requestId = ++detailRequestId;
  lastFocusedElement = document.activeElement;

  overlay.hidden = false;
  document.body.classList.add('modal-open');
  modalBody.innerHTML = '<p class="modal-message">Carregando receita...</p>';
  closeModalBtn.focus();

  try {
    const data = await fetchJSON(`${API}/lookup.php?i=${encodeURIComponent(id)}`);
    if (requestId !== detailRequestId) return; // o usuário já fechou ou abriu outra

    const meal = data.meals && data.meals[0];
    if (!meal) throw new Error('Receita não encontrada');
    renderDetail(meal);
  } catch (err) {
    if (requestId !== detailRequestId) return;
    console.error(err);
    modalBody.innerHTML = '<p class="modal-message modal-message--error">Não foi possível carregar essa receita agora.</p>';
  }
}

/**
 * Fecha o modal, libera o scroll e devolve o foco para onde o usuário estava.
 */
function closeDetail() {
  if (overlay.hidden) return;
  detailRequestId++; // invalida qualquer carregamento pendente
  overlay.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
}

closeModalBtn.addEventListener('click', closeDetail);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetail(); });
document.addEventListener('keydown', (e) => {
  if (overlay.hidden) return;
  if (e.key === 'Escape') closeDetail();
  // O modal só tem um elemento focável (o botão fechar): prendemos o Tab nele
  if (e.key === 'Tab') { e.preventDefault(); closeModalBtn.focus(); }
});

// =========================================
// Inicialização
// =========================================

/**
 * Ponto de entrada: atualiza o contador de favoritos,
 * marca a aba inicial e carrega categorias e receitas.
 */
function init() {
  saveFavorites();
  setActiveTab(state.view);
  loadCategories();
  loadMeals(ALL);
}

init();
