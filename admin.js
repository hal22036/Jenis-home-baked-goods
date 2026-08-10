const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  orders: [],
  pickupDates: [],
  products: [],
  coupons: []
};

const el = {
  loginPanel: document.querySelector("#login-panel"),
  adminPanel: document.querySelector("#admin-panel"),
  datesPanel: document.querySelector("#dates-panel"),
  productsPanel: document.querySelector("#products-panel"),
  couponsPanel: document.querySelector("#coupons-panel"),
  loginForm: document.querySelector("#admin-login-form"),
  loginMessage: document.querySelector("#login-message"),
  adminMessage: document.querySelector("#admin-message"),
  dateAdminMessage: document.querySelector("#date-admin-message"),
  productAdminMessage: document.querySelector("#product-admin-message"),
  couponAdminMessage: document.querySelector("#coupon-admin-message"),
  ordersList: document.querySelector("#orders-list"),
  pickupDatesList: document.querySelector("#pickup-dates-list"),
  productsList: document.querySelector("#products-list"),
  couponsList: document.querySelector("#coupons-list"),
  includeArchived: document.querySelector("#include-archived"),
  orderPickupFilter: document.querySelector("#order-pickup-filter"),
  orderInvoiceFilter: document.querySelector("#order-invoice-filter"),
  clearOrderFilters: document.querySelector("#clear-order-filters"),
  refreshOrders: document.querySelector("#refresh-orders"),
  refreshProducts: document.querySelector("#refresh-products"),
  refreshCoupons: document.querySelector("#refresh-coupons"),
  signOut: document.querySelector("#admin-sign-out"),
  pickupDateForm: document.querySelector("#pickup-date-form"),
  pickupDateId: document.querySelector("#pickup-date-id"),
  pickupDateInput: document.querySelector("#pickup-date-input"),
  pickupCapacityInput: document.querySelector("#pickup-capacity-input"),
  pickupOpenInput: document.querySelector("#pickup-open-input"),
  clearDateForm: document.querySelector("#clear-date-form"),
  couponForm: document.querySelector("#coupon-form"),
  couponOriginalCode: document.querySelector("#coupon-original-code"),
  couponCodeInput: document.querySelector("#coupon-code-input"),
  couponDescriptionInput: document.querySelector("#coupon-description-input"),
  couponTypeInput: document.querySelector("#coupon-type-input"),
  couponPercentField: document.querySelector("#coupon-percent-field"),
  couponPercentInput: document.querySelector("#coupon-percent-input"),
  couponAmountField: document.querySelector("#coupon-amount-field"),
  couponAmountInput: document.querySelector("#coupon-amount-input"),
  couponMinimumInput: document.querySelector("#coupon-minimum-input"),
  couponStartInput: document.querySelector("#coupon-start-input"),
  couponEndInput: document.querySelector("#coupon-end-input"),
  couponMaxUsesInput: document.querySelector("#coupon-max-uses-input"),
  couponActiveInput: document.querySelector("#coupon-active-input"),
  clearCouponForm: document.querySelector("#clear-coupon-form")
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

function prettyDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
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
  el.couponsPanel.hidden = true;
}

async function showAdmin() {
  el.loginPanel.hidden = true;
  el.adminPanel.hidden = false;
  el.datesPanel.hidden = false;
  el.productsPanel.hidden = false;
  el.couponsPanel.hidden = false;
  await Promise.all([loadOrders(), loadPickupDates(), loadProducts(), loadCoupons()]);
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
el.refreshCoupons.addEventListener("click", loadCoupons);
el.couponTypeInput.addEventListener("change", syncCouponTypeFields);
el.clearCouponForm.addEventListener("click", clearCouponForm);

el.includeArchived.addEventListener("change", loadOrders);
el.orderPickupFilter.addEventListener("change", renderOrders);
el.orderInvoiceFilter.addEventListener("change", renderOrders);
el.clearOrderFilters.addEventListener("click", () => {
  el.orderPickupFilter.value = "all";
  el.orderInvoiceFilter.value = "all";
  renderOrders();
});

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
  renderOrderFilters();
  renderOrders();
}

function renderOrderFilters() {
  const selectedPickupDate = el.orderPickupFilter.value;
  const pickupDates = [...new Set(state.orders.map(order => order.pickup_date))]
    .sort((a, b) => a.localeCompare(b));

  el.orderPickupFilter.innerHTML = `
    <option value="all">All pickup dates</option>
    ${pickupDates.map(date => `<option value="${date}">${prettyDate(date)}</option>`).join("")}
  `;

  if (selectedPickupDate === "all" || pickupDates.includes(selectedPickupDate)) {
    el.orderPickupFilter.value = selectedPickupDate;
  }
}

function filteredOrders() {
  return state.orders.filter(order => {
    const pickupDateMatches =
      el.orderPickupFilter.value === "all" || order.pickup_date === el.orderPickupFilter.value;
    const invoiceMatches = invoiceFilterMatches(order, el.orderInvoiceFilter.value);

    return pickupDateMatches && invoiceMatches;
  });
}

function invoiceFilterMatches(order, filter) {
  if (filter === "needs-invoice") return order.invoice_requested && !order.invoice_sent;
  if (filter === "requested") return order.invoice_requested;
  if (filter === "sent") return order.invoice_sent;
  if (filter === "not-requested") return !order.invoice_requested;
  return true;
}

function renderOrders() {
  const orders = filteredOrders();

  if (!state.orders.length) {
    el.ordersList.innerHTML = "<p class=\"muted\">No orders to show.</p>";
    setMessage(el.adminMessage, "0 orders shown.", "success");
    return;
  }

  if (!orders.length) {
    el.ordersList.innerHTML = "<p class=\"muted\">No orders match those filters.</p>";
    setMessage(el.adminMessage, `0 of ${state.orders.length} orders shown.`, "success");
    return;
  }

  const ordersByPickupDate = orders.reduce((groups, order) => {
    if (!groups.has(order.pickup_date)) groups.set(order.pickup_date, []);
    groups.get(order.pickup_date).push(order);
    return groups;
  }, new Map());

  el.ordersList.innerHTML = [...ordersByPickupDate.entries()].map(([pickupDate, dateOrders]) => `
    <section class="order-date-group">
      <div class="order-date-heading">
        <h3>${prettyDate(pickupDate)}</h3>
        <span>${dateOrders.length} order${dateOrders.length === 1 ? "" : "s"}</span>
      </div>
      <div class="orders-list">
        ${dateOrders.map(order => orderCardMarkup(order)).join("")}
      </div>
    </section>
  `).join("");

  setMessage(
    el.adminMessage,
    `${orders.length} of ${state.orders.length} order${state.orders.length === 1 ? "" : "s"} shown.`,
    "success"
  );

  el.ordersList.querySelectorAll("[data-save-order]").forEach(button => {
    button.addEventListener("click", saveOrderStatus);
  });
}

function orderCardMarkup(order) {
  return `
    <article class="admin-order ${order.archived ? "is-archived" : ""}" data-order-id="${order.order_id}">
      <div class="order-heading">
        <div>
          <h3>${order.order_code}</h3>
          <p>${prettyDate(order.pickup_date)} · ${order.customer_name}</p>
        </div>
        <strong>${money(order.total_cents)}</strong>
      </div>

      <dl class="admin-details">
        <div><dt>Order placed</dt><dd>${prettyDateTime(order.created_at)}</dd></div>
        <div><dt>Phone</dt><dd><a href="tel:${order.customer_phone}">${order.customer_phone}</a></dd></div>
        <div><dt>Email</dt><dd>${order.customer_email ? `<a href="mailto:${order.customer_email}">${order.customer_email}</a>` : "Not provided"}</dd></div>
        <div><dt>Payment</dt><dd>${paymentLabel(order.payment_method)}</dd></div>
        <div><dt>Method</dt><dd>${fulfillmentLabel(order.fulfillment_method)}</dd></div>
        <div><dt>Receipt email</dt><dd>${invoiceStatusLabel(order)}</dd></div>
        <div><dt>Loaf spots</dt><dd>${order.total_loaves}</dd></div>
        ${order.discount_cents ? `<div><dt>Coupon</dt><dd>${order.coupon_code} (-${money(order.discount_cents)})</dd></div>` : ""}
        <div><dt>Tax</dt><dd>${money(order.tax_cents || 0)}</dd></div>
        ${order.shipping_cents ? `<div><dt>Shipping</dt><dd>${money(order.shipping_cents)}</dd></div>` : ""}
      </dl>

      ${order.fulfillment_method === "shipping" ? `
        <p class="admin-notes"><strong>Shipping address:</strong> ${order.shipping_address || ""}</p>
      ` : ""}

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
        <label class="receipt-email-field">
          Receipt email
          <input data-customer-email type="email" value="${escapeAttribute(order.customer_email || "")}" placeholder="customer@example.com" />
        </label>
        <label class="inline-check invoice-requested-check">
          <input type="checkbox" data-invoice-requested ${order.invoice_requested ? "checked" : ""} />
          Receipt requested
        </label>
        <label class="inline-check archive-check">
          <input type="checkbox" data-archived ${order.archived ? "checked" : ""} />
          Archived
        </label>
        <label class="inline-check invoice-sent-check">
          <input type="checkbox" data-invoice-sent ${order.invoice_sent ? "checked" : ""} />
          Invoice sent
        </label>
      </div>

      <div class="admin-order-actions">
        <a class="secondary-button compact-button" href="invoice.html?order=${encodeURIComponent(order.order_code)}" target="_blank" rel="noopener">
          View invoice
        </a>
        <button class="secondary-button compact-button" type="button" data-save-order>
          Save order status
        </button>
      </div>
      <p class="message" data-order-message></p>
    </article>
  `;
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

function fulfillmentLabel(value) {
  return value === "shipping" ? "Shipping" : "Pickup";
}

function adminItemName(item) {
  if (item.display_group && item.option_label) {
    return `${item.display_group} - ${item.option_label}`;
  }

  return item.name;
}

function invoiceStatusLabel(order) {
  if (!order.invoice_requested) return "Not requested";
  return order.invoice_sent ? "Requested and sent" : "Requested";
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function saveOrderStatus(event) {
  const card = event.currentTarget.closest("[data-order-id]");
  const message = card.querySelector("[data-order-message]");
  const button = event.currentTarget;
  const invoiceSent = card.querySelector("[data-invoice-sent]").checked;
  const invoiceRequested = card.querySelector("[data-invoice-requested]").checked || invoiceSent;

  button.disabled = true;
  setMessage(message, "Saving...");

  const { error } = await supabaseClient.rpc("admin_update_order_status", {
    p_order_id: card.dataset.orderId,
    p_payment_status: card.querySelector("[data-payment-status]").value,
    p_fulfillment_status: card.querySelector("[data-fulfillment-status]").value,
    p_archived: card.querySelector("[data-archived]").checked,
    p_invoice_requested: invoiceRequested,
    p_invoice_sent: invoiceSent,
    p_customer_email: card.querySelector("[data-customer-email]").value.trim()
  });

  button.disabled = false;

  if (error) {
    setMessage(message, error.message, "error");
    return;
  }

  setMessage(message, "Saved.", "success");
  await Promise.all([loadOrders(), loadPickupDates()]);
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
              <p>
                ${money(product.price_cents)}
                ${product.capacity_units > 0 ? "- counts toward loaf capacity" : "- add-on item"}
                ${product.shippable ? "- can ship" : "- pickup only"}
              </p>
            </div>
            <div class="admin-product-checks">
              <label class="inline-check product-active-check">
                <span>Offer this week</span>
                <input type="checkbox" data-product-active ${product.active ? "checked" : ""} />
              </label>
              <label class="inline-check product-active-check">
                <span>Can ship</span>
                <input type="checkbox" data-product-shippable ${product.shippable ? "checked" : ""} />
              </label>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  el.productsList.querySelectorAll("[data-product-active], [data-product-shippable]").forEach(input => {
    input.addEventListener("change", saveProductFlags);
  });
}

async function saveProductFlags(event) {
  const input = event.currentTarget;
  const row = input.closest("[data-product-id]");
  const previousValue = !input.checked;

  input.disabled = true;
  setMessage(el.productAdminMessage, "Saving product settings...");

  const { error } = await supabaseClient.rpc("admin_update_product_flags", {
    p_product_id: row.dataset.productId,
    p_active: row.querySelector("[data-product-active]").checked,
    p_shippable: row.querySelector("[data-product-shippable]").checked
  });

  input.disabled = false;

  if (error) {
    input.checked = previousValue;
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  row.classList.toggle("is-inactive", !row.querySelector("[data-product-active]").checked);
  setMessage(el.productAdminMessage, "Product settings saved.", "success");
  await loadProducts();
}

function dollarsToCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function centsToDollars(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function discountLabel(coupon) {
  if (coupon.discount_type === "percent") return `${coupon.percent_off}% off`;
  return `${money(coupon.amount_off_cents)} off`;
}

function couponDateRange(coupon) {
  if (!coupon.starts_on && !coupon.ends_on) return "No date limit";
  if (coupon.starts_on && coupon.ends_on) return `${prettyDate(coupon.starts_on)} - ${prettyDate(coupon.ends_on)}`;
  if (coupon.starts_on) return `Starts ${prettyDate(coupon.starts_on)}`;
  return `Ends ${prettyDate(coupon.ends_on)}`;
}

function syncCouponTypeFields() {
  const isPercent = el.couponTypeInput.value === "percent";

  el.couponPercentField.hidden = !isPercent;
  el.couponPercentInput.required = isPercent;
  el.couponAmountField.hidden = isPercent;
  el.couponAmountInput.required = !isPercent;
}

async function loadCoupons() {
  setMessage(el.couponAdminMessage, "Loading coupons...");

  const { data, error } = await supabaseClient.rpc("admin_list_coupons");

  if (error) {
    setMessage(el.couponAdminMessage, error.message, "error");
    return;
  }

  state.coupons = data || [];
  renderCoupons();
  setMessage(el.couponAdminMessage, `${state.coupons.length} coupon${state.coupons.length === 1 ? "" : "s"} shown.`, "success");
}

function renderCoupons() {
  if (!state.coupons.length) {
    el.couponsList.innerHTML = "<p class=\"muted\">No coupons yet.</p>";
    return;
  }

  el.couponsList.innerHTML = state.coupons.map(coupon => `
    <article class="coupon-row ${coupon.active ? "" : "is-inactive"}" data-coupon-code="${escapeAttribute(coupon.code)}">
      <div>
        <div class="coupon-heading">
          <strong>${coupon.code}</strong>
          <span>${coupon.active ? "Active" : "Inactive"}</span>
        </div>
        <p>${coupon.description || "No description"}</p>
        <p>
          ${discountLabel(coupon)}
          - Minimum ${money(coupon.minimum_subtotal_cents)}
          - ${coupon.used_count || 0}${coupon.max_uses ? ` of ${coupon.max_uses}` : ""} used
          - ${couponDateRange(coupon)}
        </p>
      </div>
      <div class="coupon-row-actions">
        <button class="secondary-button compact-button" type="button" data-edit-coupon>Edit</button>
        <button class="secondary-button compact-button danger-button" type="button" data-remove-coupon>
          ${coupon.used_count ? "Deactivate" : "Remove"}
        </button>
      </div>
    </article>
  `).join("");

  el.couponsList.querySelectorAll("[data-edit-coupon]").forEach(button => {
    button.addEventListener("click", editCoupon);
  });

  el.couponsList.querySelectorAll("[data-remove-coupon]").forEach(button => {
    button.addEventListener("click", removeCoupon);
  });
}

function editCoupon(event) {
  const row = event.currentTarget.closest("[data-coupon-code]");
  const coupon = state.coupons.find(item => item.code === row.dataset.couponCode);

  el.couponOriginalCode.value = coupon.code;
  el.couponCodeInput.value = coupon.code;
  el.couponDescriptionInput.value = coupon.description || "";
  el.couponTypeInput.value = coupon.discount_type;
  el.couponPercentInput.value = coupon.percent_off || "";
  el.couponAmountInput.value = coupon.amount_off_cents ? centsToDollars(coupon.amount_off_cents) : "";
  el.couponMinimumInput.value = centsToDollars(coupon.minimum_subtotal_cents);
  el.couponStartInput.value = coupon.starts_on || "";
  el.couponEndInput.value = coupon.ends_on || "";
  el.couponMaxUsesInput.value = coupon.max_uses || "";
  el.couponActiveInput.checked = coupon.active;
  syncCouponTypeFields();
  el.couponCodeInput.focus();
}

function clearCouponForm() {
  el.couponOriginalCode.value = "";
  el.couponCodeInput.value = "";
  el.couponDescriptionInput.value = "";
  el.couponTypeInput.value = "percent";
  el.couponPercentInput.value = "10";
  el.couponAmountInput.value = "";
  el.couponMinimumInput.value = "0.00";
  el.couponStartInput.value = "";
  el.couponEndInput.value = "";
  el.couponMaxUsesInput.value = "";
  el.couponActiveInput.checked = true;
  syncCouponTypeFields();
  setMessage(el.couponAdminMessage);
}

el.couponForm.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage(el.couponAdminMessage, "Saving coupon...");

  const isPercent = el.couponTypeInput.value === "percent";
  const { error } = await supabaseClient.rpc("admin_save_coupon", {
    p_original_code: el.couponOriginalCode.value || null,
    p_code: el.couponCodeInput.value,
    p_description: el.couponDescriptionInput.value,
    p_discount_type: el.couponTypeInput.value,
    p_percent_off: isPercent ? Number(el.couponPercentInput.value) : null,
    p_amount_off_cents: isPercent ? null : dollarsToCents(el.couponAmountInput.value),
    p_minimum_subtotal_cents: dollarsToCents(el.couponMinimumInput.value),
    p_starts_on: el.couponStartInput.value || null,
    p_ends_on: el.couponEndInput.value || null,
    p_max_uses: el.couponMaxUsesInput.value ? Number(el.couponMaxUsesInput.value) : null,
    p_active: el.couponActiveInput.checked
  });

  if (error) {
    setMessage(el.couponAdminMessage, error.message, "error");
    return;
  }

  setMessage(el.couponAdminMessage, "Coupon saved.", "success");
  clearCouponForm();
  await loadCoupons();
});

async function removeCoupon(event) {
  const row = event.currentTarget.closest("[data-coupon-code]");
  const code = row.dataset.couponCode;

  setMessage(el.couponAdminMessage, "Updating coupon...");

  const { data, error } = await supabaseClient.rpc("admin_remove_coupon", {
    p_code: code
  });

  if (error) {
    setMessage(el.couponAdminMessage, error.message, "error");
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  setMessage(
    el.couponAdminMessage,
    result?.removed ? "Coupon removed." : "Coupon has been used before, so it was deactivated instead.",
    "success"
  );
  clearCouponForm();
  await loadCoupons();
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
