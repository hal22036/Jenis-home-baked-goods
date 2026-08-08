const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  orders: [],
  pickupDates: [],
  products: []
};

const el = {
  loginPanel: document.querySelector("#login-panel"),
  adminPanel: document.querySelector("#admin-panel"),
  datesPanel: document.querySelector("#dates-panel"),
  productsPanel: document.querySelector("#products-panel"),
  loginForm: document.querySelector("#admin-login-form"),
  loginMessage: document.querySelector("#login-message"),
  adminMessage: document.querySelector("#admin-message"),
  dateAdminMessage: document.querySelector("#date-admin-message"),
  productAdminMessage: document.querySelector("#product-admin-message"),
  ordersList: document.querySelector("#orders-list"),
  pickupDatesList: document.querySelector("#pickup-dates-list"),
  productsList: document.querySelector("#products-list"),
  includeArchived: document.querySelector("#include-archived"),
  refreshOrders: document.querySelector("#refresh-orders"),
  refreshProducts: document.querySelector("#refresh-products"),
  signOut: document.querySelector("#admin-sign-out"),
  pickupDateForm: document.querySelector("#pickup-date-form"),
  pickupDateId: document.querySelector("#pickup-date-id"),
  pickupDateInput: document.querySelector("#pickup-date-input"),
  pickupCapacityInput: document.querySelector("#pickup-capacity-input"),
  pickupOpenInput: document.querySelector("#pickup-open-input"),
  clearDateForm: document.querySelector("#clear-date-form")
};

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

function prettyDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function setMessage(target, message = "", type = "") {
  target.textContent = message;
  target.className = type ? `message ${type}` : "message";
}

async function boot() {
  const { data } = await supabaseClient.auth.getSession();

  if (data.session) {
    await showAdmin();
  } else {
    showLogin();
  }
}

function showLogin() {
  el.loginPanel.hidden = false;
  el.adminPanel.hidden = true;
  el.datesPanel.hidden = true;
  el.productsPanel.hidden = true;
}

async function showAdmin() {
  el.loginPanel.hidden = true;
  el.adminPanel.hidden = false;
  el.datesPanel.hidden = false;
  el.productsPanel.hidden = false;
  await Promise.all([loadOrders(), loadPickupDates(), loadProducts()]);
}

el.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage(el.loginMessage, "Signing in...");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: document.querySelector("#admin-email").value.trim(),
    password: document.querySelector("#admin-password").value
  });

  if (error) {
    setMessage(el.loginMessage, error.message, "error");
    return;
  }

  setMessage(el.loginMessage);
  await showAdmin();
});

el.signOut.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

el.refreshOrders.addEventListener("click", () => {
  loadOrders();
  loadPickupDates();
  loadProducts();
});

el.refreshProducts.addEventListener("click", loadProducts);

el.includeArchived.addEventListener("change", loadOrders);

async function loadOrders() {
  setMessage(el.adminMessage, "Loading orders...");

  const { data, error } = await supabaseClient.rpc("admin_list_orders", {
    p_include_archived: el.includeArchived.checked
  });

  if (error) {
    setMessage(el.adminMessage, error.message, "error");
    return;
  }

  state.orders = data || [];
  renderOrders();
  setMessage(el.adminMessage, `${state.orders.length} order${state.orders.length === 1 ? "" : "s"} shown.`, "success");
}

function renderOrders() {
  if (!state.orders.length) {
    el.ordersList.innerHTML = "<p class=\"muted\">No orders to show.</p>";
    return;
  }

  el.ordersList.innerHTML = state.orders.map(order => `
    <article class="admin-order ${order.archived ? "is-archived" : ""}" data-order-id="${order.order_id}">
      <div class="order-heading">
        <div>
          <h3>${order.order_code}</h3>
          <p>${prettyDate(order.pickup_date)} · ${order.customer_name}</p>
        </div>
        <strong>${money(order.total_cents)}</strong>
      </div>

      <dl class="admin-details">
        <div><dt>Phone</dt><dd><a href="tel:${order.customer_phone}">${order.customer_phone}</a></dd></div>
        <div><dt>Email</dt><dd><a href="mailto:${order.customer_email}">${order.customer_email}</a></dd></div>
        <div><dt>Payment</dt><dd>${paymentLabel(order.payment_method)}</dd></div>
        <div><dt>Invoice</dt><dd>${order.invoice_requested ? "Requested" : "Not requested"}</dd></div>
        <div><dt>Loaf spots</dt><dd>${order.total_loaves}</dd></div>
      </dl>

      <div class="admin-items">
        ${(order.items || []).map(item => `
          <div>
            <span>${item.quantity}x ${adminItemName(item)}</span>
            <span>${money(item.quantity * item.unit_price_cents)}</span>
          </div>
        `).join("")}
      </div>

      ${order.notes ? `<p class="admin-notes"><strong>Questions/comments:</strong> ${order.notes}</p>` : ""}

      <div class="status-grid">
        <label>
          Payment status
          <select data-payment-status>
            ${option("pending", "Pending", order.payment_status)}
            ${option("paid", "Paid", order.payment_status)}
            ${option("refunded", "Refunded", order.payment_status)}
          </select>
        </label>
        <label>
          Fulfillment
          <select data-fulfillment-status>
            ${option("new", "New", order.fulfillment_status)}
            ${option("prepping", "Prepping", order.fulfillment_status)}
            ${option("ready", "Ready", order.fulfillment_status)}
            ${option("fulfilled", "Fulfilled", order.fulfillment_status)}
            ${option("canceled", "Canceled", order.fulfillment_status)}
          </select>
        </label>
        <label class="inline-check archive-check">
          <input type="checkbox" data-archived ${order.archived ? "checked" : ""} />
          Archived
        </label>
      </div>

      <button class="secondary-button" type="button" data-save-order>
        Save order status
      </button>
      <p class="message" data-order-message></p>
    </article>
  `).join("");

  el.ordersList.querySelectorAll("[data-save-order]").forEach(button => {
    button.addEventListener("click", saveOrderStatus);
  });
}

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
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

function adminItemName(item) {
  if (item.display_group && item.option_label) {
    return `${item.display_group} - ${item.option_label}`;
  }

  return item.name;
}

async function saveOrderStatus(event) {
  const card = event.currentTarget.closest("[data-order-id]");
  const message = card.querySelector("[data-order-message]");
  const button = event.currentTarget;

  button.disabled = true;
  setMessage(message, "Saving...");

  const { error } = await supabaseClient.rpc("admin_update_order_status", {
    p_order_id: card.dataset.orderId,
    p_payment_status: card.querySelector("[data-payment-status]").value,
    p_fulfillment_status: card.querySelector("[data-fulfillment-status]").value,
    p_archived: card.querySelector("[data-archived]").checked
  });

  button.disabled = false;

  if (error) {
    setMessage(message, error.message, "error");
    return;
  }

  setMessage(message, "Saved.", "success");
  await loadOrders();
}

async function loadPickupDates() {
  const { data, error } = await supabaseClient.rpc("admin_list_pickup_dates");

  if (error) {
    setMessage(el.dateAdminMessage, error.message, "error");
    return;
  }

  state.pickupDates = data || [];
  renderPickupDates();
}

async function loadProducts() {
  setMessage(el.productAdminMessage, "Loading products...");

  const { data, error } = await supabaseClient.rpc("admin_list_products");

  if (error) {
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  state.products = data || [];
  renderProducts();
  setMessage(el.productAdminMessage, `${state.products.length} product${state.products.length === 1 ? "" : "s"} shown.`, "success");
}

function renderProducts() {
  if (!state.products.length) {
    el.productsList.innerHTML = "<p class=\"muted\">No products to show.</p>";
    return;
  }

  const groups = state.products.reduce((map, product) => {
    const category = product.category || "Other";
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(product);
    return map;
  }, new Map());

  el.productsList.innerHTML = [...groups.entries()].map(([category, products]) => `
    <section class="admin-product-category">
      <h3>${category}</h3>
      <div class="admin-products">
        ${products.map(product => `
          <article class="admin-product-row ${product.active ? "" : "is-inactive"}" data-product-id="${product.id}">
            <div>
              <strong>${product.display_group && product.option_label ? `${product.display_group} - ${product.option_label}` : product.name}</strong>
              <p>${money(product.price_cents)} ${product.capacity_units > 0 ? "· counts toward loaf capacity" : "· add-on item"}</p>
            </div>
            <label class="inline-check product-active-check">
              <span>Offer this week</span>
              <input type="checkbox" data-product-active ${product.active ? "checked" : ""} />
            </label>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  el.productsList.querySelectorAll("[data-product-active]").forEach(input => {
    input.addEventListener("change", saveProductActive);
  });
}

async function saveProductActive(event) {
  const input = event.currentTarget;
  const row = input.closest("[data-product-id]");
  const previousValue = !input.checked;

  input.disabled = true;
  setMessage(el.productAdminMessage, "Saving product availability...");

  const { error } = await supabaseClient.rpc("admin_update_product_active", {
    p_product_id: row.dataset.productId,
    p_active: input.checked
  });

  input.disabled = false;

  if (error) {
    input.checked = previousValue;
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  row.classList.toggle("is-inactive", !input.checked);
  setMessage(el.productAdminMessage, "Product availability saved.", "success");
  await loadProducts();
}

function renderPickupDates() {
  if (!state.pickupDates.length) {
    el.pickupDatesList.innerHTML = "<p class=\"muted\">No pickup dates yet.</p>";
    return;
  }

  el.pickupDatesList.innerHTML = state.pickupDates.map(date => `
    <article class="pickup-date-row" data-date-id="${date.id}">
      <div>
        <strong>${prettyDate(date.pickup_date)}</strong>
        <p>${date.ordered_count} of ${date.capacity} loaf spots claimed · ${date.is_open ? "Open" : "Closed"}</p>
      </div>
      <button class="secondary-button compact-button" type="button" data-edit-date>
        Edit
      </button>
    </article>
  `).join("");

  el.pickupDatesList.querySelectorAll("[data-edit-date]").forEach(button => {
    button.addEventListener("click", editPickupDate);
  });
}

function editPickupDate(event) {
  const row = event.currentTarget.closest("[data-date-id]");
  const pickupDate = state.pickupDates.find(date => date.id === row.dataset.dateId);

  el.pickupDateId.value = pickupDate.id;
  el.pickupDateInput.value = pickupDate.pickup_date;
  el.pickupCapacityInput.value = pickupDate.capacity;
  el.pickupOpenInput.checked = pickupDate.is_open;
  el.pickupDateInput.focus();
}

el.clearDateForm.addEventListener("click", clearPickupDateForm);

function clearPickupDateForm() {
  el.pickupDateId.value = "";
  el.pickupDateInput.value = "";
  el.pickupCapacityInput.value = "14";
  el.pickupOpenInput.checked = true;
  setMessage(el.dateAdminMessage);
}

el.pickupDateForm.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage(el.dateAdminMessage, "Saving pickup date...");

  const { error } = await supabaseClient.rpc("admin_save_pickup_date", {
    p_id: el.pickupDateId.value || null,
    p_pickup_date: el.pickupDateInput.value,
    p_capacity: Number(el.pickupCapacityInput.value),
    p_is_open: el.pickupOpenInput.checked
  });

  if (error) {
    setMessage(el.dateAdminMessage, error.message, "error");
    return;
  }

  setMessage(el.dateAdminMessage, "Pickup date saved.", "success");
  clearPickupDateForm();
  await loadPickupDates();
  await loadOrders();
});

boot();
