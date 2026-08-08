const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const message = document.querySelector("#invoice-message");
const content = document.querySelector("#invoice-content");
const PICKUP_WINDOW = "4-7 pm";
const PICKUP_ADDRESS = "7140 Anchor Terrace St.";
const GATE_CODE = "#7716";
const CONTACT_PHONE = "801-602-8443";

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

function prettyDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function prettyDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function itemName(item) {
  if (item.display_group && item.option_label) {
    return `${item.display_group} - ${item.option_label}`;
  }

  return item.name;
}

function itemImage(item) {
  if (!item.image_url) return "";

  return `
    <img
      class="invoice-item-image"
      src="${escapeHtml(item.image_url)}"
      alt="${escapeHtml(itemName(item))}"
      onerror="this.hidden=true"
    />
  `;
}

function paymentLabel(value) {
  return {
    Venmo: "Venmo",
    Zelle: "Zelle",
    PayPal: "PayPal",
    CashApp: "CashApp",
    CashAtPickup: "Cash at Pickup"
  }[value] || value;
}

function renderInvoice(order) {
  const items = order.items || [];

  content.innerHTML = `
    <dl class="receipt invoice-receipt">
      <div><dt>Order code</dt><dd>${escapeHtml(order.order_code)}</dd></div>
      <div><dt>Order placed</dt><dd>${prettyDateTime(order.created_at)}</dd></div>
      <div><dt>Pickup</dt><dd>${prettyDate(order.pickup_date)}, ${PICKUP_WINDOW}</dd></div>
      <div><dt>Name</dt><dd>${escapeHtml(order.customer_name)}</dd></div>
      <div><dt>Phone</dt><dd>${escapeHtml(order.customer_phone)}</dd></div>
      ${order.customer_email ? `<div><dt>Email</dt><dd>${escapeHtml(order.customer_email)}</dd></div>` : ""}
      <div><dt>Payment</dt><dd>${escapeHtml(paymentLabel(order.payment_method))}</dd></div>
    </dl>

    <div class="invoice-items">
      ${items.map(item => `
        <div>
          <span class="invoice-item-name">
            ${itemImage(item)}
            <span>${item.quantity}x ${escapeHtml(itemName(item))}</span>
          </span>
          <span>${money(item.quantity * item.unit_price_cents)}</span>
        </div>
      `).join("")}
    </div>

    ${order.notes ? `<p class="admin-notes"><strong>Questions/comments:</strong> ${escapeHtml(order.notes)}</p>` : ""}

    <div class="summary">
      <strong>Total</strong>
      <strong>${money(order.total_cents)}</strong>
    </div>

    <div class="pickup-details">
      <h3>Pickup details</h3>
      <p>Pickup is on ${prettyDate(order.pickup_date)} between ${PICKUP_WINDOW}.</p>
      <p>
        Address: ${PICKUP_ADDRESS}<br>
        Gate Code: ${GATE_CODE}<br>
        Please call/text with any questions: ${CONTACT_PHONE}.
      </p>
    </div>
  `;

  content.hidden = false;
  message.textContent = "";
}

async function loadInvoice() {
  const orderCode = new URLSearchParams(window.location.search).get("order");

  if (!orderCode) {
    message.textContent = "Missing order code.";
    message.className = "message error";
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_order_invoice", {
    p_order_code: orderCode
  });

  if (error) {
    message.textContent = error.message;
    message.className = "message error";
    return;
  }

  const order = Array.isArray(data) ? data[0] : data;

  if (!order) {
    message.textContent = "Invoice not found.";
    message.className = "message error";
    return;
  }

  renderInvoice(order);
}

loadInvoice();
