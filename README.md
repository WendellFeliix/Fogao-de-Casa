# Fogão de Casa

Um app de receitas feito com HTML, CSS e JavaScript puro.

Eu gosto de cozinhar, então quis fazer um projeto que eu mesmo usaria: um lugar para procurar receitas, ver o que leva e guardar as que eu quero fazer depois. Também estou começando na programação, e esse projeto foi a minha forma de praticar com algo que eu curto de verdade.

## O que ele faz

- Mostra uma lista de receitas assim que a página abre
- Deixa buscar uma receita pelo nome
- Filtra por categoria (carnes, sobremesas, frutos do mar, etc.)
- Abre uma receita com foto, ingredientes e modo de preparo
- Permite favoritar receitas. Elas ficam salvas no navegador, então continuam lá quando você volta
- Funciona no celular

## Como rodar

Não precisa instalar nada. Baixe o projeto e abra o arquivo `index.html` no navegador. Só precisa de internet, porque as receitas vêm de uma API.

## Como o projeto está organizado

```
fogao-de-casa/
├── index.html
├── css/style.css
└── js/script.js
```

O `index.html` tem a estrutura da página, o `style.css` cuida do visual e o `script.js` busca as receitas, desenha os cards e controla os favoritos e o modal. Comentei cada função no código para explicar o que ela faz.

## O que usei

- HTML, CSS e JavaScript, sem framework
- [TheMealDB](https://www.themealdb.com/api.php), uma API gratuita de receitas
- `localStorage` para guardar os favoritos
- Google Fonts (Lora e Work Sans)

## O que foi mais difícil

Montar a estrutura e fazer tudo funcionar junto foi a parte que mais me deu trabalho. Como ainda tenho pouca experiência, eu faço o código em partes pequenas e vou testando, e isso leva tempo. Mas foi assim que o projeto saiu do papel: primeiro a lista, depois a busca, depois as categorias, o modal e os favoritos.

## Limitações

- As receitas estão em inglês, porque a API entrega assim. Por isso a busca funciona melhor com palavras como *chicken*, *cake* ou *pasta*.
- A aba "Todas" não mostra literalmente todas as receitas. A API não tem uma opção de listar tudo, então o app junta as que começam com A, B e C. Para ver as outras, use a busca e as categorias.
- Ainda não tem testes automatizados.

## O que quero melhorar

- Escrever testes
- Traduzir as receitas
- Adicionar paginação
- Criar um modo escuro

Receitas fornecidas pela [TheMealDB](https://www.themealdb.com).