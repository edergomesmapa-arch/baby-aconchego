// netlify/functions/create-preference.js
//
// Essa função recebe os itens do carrinho do site e cria uma
// "preferência de pagamento" no Mercado Pago. O retorno inclui o
// "init_point", que é o link do Checkout Pro pra onde o cliente é
// redirecionado pra pagar com Pix ou cartão.
//
// Requer a variável de ambiente MP_ACCESS_TOKEN configurada no
// Netlify (Site settings > Environment variables), com o Access
// Token de PRODUÇÃO da sua conta Mercado Pago.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método não permitido." }),
    };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "MP_ACCESS_TOKEN não configurado nas variáveis de ambiente do Netlify.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Corpo da requisição inválido." }),
    };
  }

  const cartItems = Array.isArray(payload.items) ? payload.items : [];

  if (cartItems.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Carrinho vazio." }),
    };
  }

  // Monta os itens no formato que o Mercado Pago espera.
  // Preço e quantidade nunca são confiados do front-end sem validação
  // básica, pra evitar item com preço 0 ou negativo.
  const items = [];
  for (const item of cartItems) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.price);
    const title = String(item.title || "Produto Baby Aconchego").slice(0, 256);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Quantidade inválida para o item "${title}".` }),
      };
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Preço inválido para o item "${title}".` }),
      };
    }

    items.push({
      id: String(item.id || title),
      title,
      quantity,
      unit_price: unitPrice,
      currency_id: "BRL",
    });
  }

  // Dados de entrega do cliente, preenchidos no carrinho do site.
  // Não são validados a fundo aqui — o essencial é que eles apareçam
  // no painel do Mercado Pago junto com o pagamento, pra você saber
  // pra onde enviar o pedido.
  const customer = payload.customer || {};
  const custNome = String(customer.nome || "").slice(0, 200);
  const custTelefone = String(customer.telefone || "").slice(0, 50);
  const custEndereco = String(customer.endereco || "").slice(0, 300);
  const custBairroCidade = String(customer.bairroCidade || "").slice(0, 200);
  const custCep = String(customer.cep || "").slice(0, 20);

  if (!custNome || !custTelefone || !custEndereco || !custBairroCidade || !custCep) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Dados de entrega incompletos." }),
    };
  }

  // Pegue a URL do próprio site pra montar os links de retorno.
  const siteUrl =
    process.env.URL || process.env.DEPLOY_PRIME_URL || "https://SEU-SITE.netlify.app";

  const preferenceBody = {
    items,
    payer: {
      name: custNome,
      phone: { number: custTelefone },
    },
    // metadata aparece no painel do Mercado Pago, dentro dos detalhes
    // de cada pagamento — é aqui que você vai ver o endereço completo.
    metadata: {
      nome_cliente: custNome,
      telefone_cliente: custTelefone,
      endereco: custEndereco,
      bairro_cidade: custBairroCidade,
      cep: custCep,
    },
    back_urls: {
      success: `${siteUrl}/?status=success`,
      failure: `${siteUrl}/?status=failure`,
      pending: `${siteUrl}/?status=pending`,
    },
    auto_return: "approved",
    statement_descriptor: "BABY ACONCHEGO",
  };

  try {
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return {
        statusCode: mpResponse.status,
        headers,
        body: JSON.stringify({ error: mpData }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        init_point: mpData.init_point,
        preference_id: mpData.id,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Erro ao falar com o Mercado Pago.", detail: err.message }),
    };
  }
};
