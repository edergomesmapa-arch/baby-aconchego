exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { items } = JSON.parse(event.body || "{}");

    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Carrinho vazio." }),
      };
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "MP_ACCESS_TOKEN não configurado nas variáveis de ambiente do Netlify.",
        }),
      };
    }

    const siteUrl = process.env.URL || "https://SEU-SITE.netlify.app";

    const preference = {
      items: items.map((i) => ({
        title: String(i.title).slice(0, 256),
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.price),
        currency_id: "BRL",
      })),
      back_urls: {
        success: `${siteUrl}/sucesso.html`,
        failure: `${siteUrl}/index.html`,
        pending: `${siteUrl}/index.html`,
      },
      auto_return: "approved",
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify(preference),
      }
    );

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      return {
        statusCode: mpResponse.status,
        body: JSON.stringify({ error: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: data.init_point }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
