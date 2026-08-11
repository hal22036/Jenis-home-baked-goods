const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  orders: [],
  pickupDates: [],
  products: [],
  coupons: [],
  taxSettings: null
};

const el = {
  loginPanel: document.querySelector("#login-panel"),
  adminPageNav: document.querySelector("#admin-page-nav"),
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
  taxSettingsForm: document.querySelector("#tax-settings-form"),
  taxEnabledInput: document.querySelector("#tax-enabled-input"),
  taxBusinessStateInput: document.querySelector("#tax-business-state-input"),
  includeArchived: document.querySelector("#include-archived"),
  orderPickupFilter: document.querySelector("#order-pickup-filter"),
  orderInvoiceFilter: document.querySelector("#order-invoice-filter"),
  clearOrderFilters: document.querySelector("#clear-order-filters"),
  manualOrderForm: document.querySelector("#manual-order-form"),
  manualPickupDate: document.querySelector("#manual-pickup-date"),
  manualCustomerName: document.querySelector("#manual-customer-name"),
  manualCustomerPhone: document.querySelector("#manual-customer-phone"),
  manualCustomerEmail: document.querySelector("#manual-customer-email"),
  manualPaymentMethod: document.querySelector("#manual-payment-method"),
  manualPaymentStatus: document.querySelector("#manual-payment-status"),
  manualFulfillmentStatus: document.querySelector("#manual-fulfillment-status"),
  manualNotes: document.querySelector("#manual-notes"),
  addManualItem: document.querySelector("#add-manual-item"),
  manualItemsList: document.querySelector("#manual-items-list"),
  manualDiscount: document.querySelector("#manual-discount"),
  manualOrderSubtotal: document.querySelector("#manual-order-subtotal"),
  manualOrderDiscount: document.querySelector("#manual-order-discount"),
  manualOrderAfterDiscount: document.querySelector("#manual-order-after-discount"),
  manualOrderLoafSpots: document.querySelector("#manual-order-loaf-spots"),
  manualOrderMessage: document.querySelector("#manual-order-message"),
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
  couponAppliesToInput: document.querySelector("#coupon-applies-to-input"),
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

const adminPages = {
  orders: el.adminPanel,
  dates: el.datesPanel,
  products: el.productsPanel,
  coupons: el.couponsPanel
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
  el.adminPageNav.hidden = true;
  el.adminPanel.hidden = true;
  el.datesPanel.hidden = true;
  el.productsPanel.hidden = true;
  el.couponsPanel.hidden = true;
}

async function showAdmin() {
  el.loginPanel.hidden = true;
  el.adminPageNav.hidden = false;
  await Promise.all([loadOrders(), loadPickupDates(), loadProducts(), loadCoupons(), loadTaxSettings()]);
  showAdminPage(currentAdminPage());
}

function currentAdminPage() {
  const page = window.location.hash.replace("#", "");
  return adminPages[page] ? page : "orders";
}

function showAdminPage(page) {
  const activePage = adminPages[page] ? page : "orders";

  Object.entries(adminPages).forEach(([name, panel]) => {
    panel.hidden = name !== activePage;
  });

  document.querySelectorAll("[data-admin-page-link]").forEach(link => {
    const isActive = link.dataset.adminPageLink === activePage;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
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

window.addEventListener("hashchange", () => {
  if (!el.adminPageNav.hidden) {
    showAdminPage(currentAdminPage());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

el.refreshOrders.addEventListener("click", () => {
  loadOrders();
  loadPickupDates();
  loadProducts();
});

el.refreshProducts.addEventListener("click", loadProducts);
el.taxSettingsForm.addEventListener("submit", saveTaxSettings);
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
el.addManualItem.addEventListener("click", () => addManualItemRow());
el.manualItemsList.addEventListener("input", updateManualOrderSubtotal);
el.manualDiscount.addEventListener("input", updateManualOrderSubtotal);
el.manualItemsList.addEventListener("change", event => {
  if (event.target.matches("[data-manual-product-select]")) {
    syncManualItemRow(event.target.closest(".manual-item-row"));
  }
  updateManualOrderSubtotal();
});
el.manualItemsList.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-manual-item]");
  if (!button) return;

  button.closest(".manual-item-row").remove();
  if (!el.manualItemsList.querySelector(".manual-item-row")) {
    addManualItemRow();
  }
  updateManualOrderSubtotal();
});
el.manualOrderForm.addEventListener("submit", saveManualOrder);

function renderManualOrderDateOptions() {
  if (!el.manualPickupDate) return;

  const selected = el.manualPickupDate.value;
  el.manualPickupDate.innerHTML = `
    <option value="">Choose order date</option>
    ${state.pickupDates.map(date => `
      <option value="${date.id}">${prettyDate(date.pickup_date)}${date.is_open ? "" : " (closed)"}</option>
    `).join("")}
  `;

  if (selected && state.pickupDates.some(date => date.id === selected)) {
    el.manualPickupDate.value = selected;
  }

  if (!el.manualItemsList.querySelector(".manual-item-row")) {
    addManualItemRow();
  }
}

function addManualItemRow(item = {}) {
  const row = document.createElement("div");
  row.className = "manual-item-row";
  row.innerHTML = `
    <label class="manual-product-field">
      Product
      <select data-manual-product-select>
        <option value="">Choose product</option>
        ${manualProductOptions(item.productId)}
        <option value="other" ${item.productId === "other" ? "selected" : ""}>Other / custom item</option>
      </select>
    </label>
    <label class="manual-custom-name-field" hidden>
      Custom item
      <input data-manual-item-name placeholder="Special order" value="${escapeAttribute(item.name || "")}" />
    </label>
    <label class="manual-quantity-field">
      Qty
      <input data-manual-item-quantity type="number" min="1" step="1" required value="${item.quantity || 1}" />
    </label>
    <div class="manual-product-details" data-manual-product-details hidden></div>
    <div class="manual-custom-controls">
      <label>
        Price each
        <input data-manual-item-price type="number" min="0" step="0.01" required placeholder="0.00" />
      </label>
      <label>
        Tax type
        <select data-manual-item-tax-category>
          ${option("home_bakery", "Home bakery food", item.taxCategory || "home_bakery")}
          ${option("general_product", "General product", item.taxCategory || "home_bakery")}
        </select>
      </label>
      <label>
        Loaf spots each
        <input data-manual-item-loaf-spots type="number" min="0" step="1" value="${item.loafSpots ?? 0}" />
      </label>
    </div>
    <button class="secondary-button compact-button" type="button" data-remove-manual-item>Remove</button>
  `;
  el.manualItemsList.append(row);
  syncManualItemRow(row);
  updateManualOrderSubtotal();
}

function manualProductOptions(selectedProductId) {
  return state.products
    .filter(product => product.active)
    .map(product => {
      const label = product.display_group && product.option_label
        ? `${product.display_group} - ${product.option_label}`
        : product.name;
      return `<option value="${product.id}" ${product.id === selectedProductId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function refreshManualProductSelects() {
  el.manualItemsList.querySelectorAll(".manual-item-row").forEach(row => {
    const productSelect = row.querySelector("[data-manual-product-select]");
    const selected = productSelect.value;
    productSelect.innerHTML = `
      <option value="">Choose product</option>
      ${manualProductOptions(selected)}
      <option value="other" ${selected === "other" ? "selected" : ""}>Other / custom item</option>
    `;
    syncManualItemRow(row);
  });
  updateManualOrderSubtotal();
}

function productById(productId) {
  return state.products.find(product => product.id === productId);
}

function syncManualItemRow(row) {
  const productSelect = row.querySelector("[data-manual-product-select]");
  const customField = row.querySelector(".manual-custom-name-field");
  const customName = row.querySelector("[data-manual-item-name]");
  const priceInput = row.querySelector("[data-manual-item-price]");
  const taxCategory = row.querySelector("[data-manual-item-tax-category]");
  const loafSpots = row.querySelector("[data-manual-item-loaf-spots]");
  const customControls = row.querySelector(".manual-custom-controls");
  const productDetails = row.querySelector("[data-manual-product-details]");
  const product = productById(productSelect.value);
  const isOther = productSelect.value === "other";
  const previousProductId = row.dataset.selectedProductId || "";

  customField.hidden = !isOther;
  customControls.hidden = !isOther;
  productDetails.hidden = !product;
  customName.required = isOther;
  priceInput.required = isOther;

  if (product) {
    priceInput.value = centsToDollars(product.price_cents);
    taxCategory.value = product.tax_category || "home_bakery";
    loafSpots.value = product.capacity_units || 0;
    refreshManualRowTotals(row);
  } else if (isOther && previousProductId && previousProductId !== "other") {
    priceInput.value = "";
    taxCategory.value = "home_bakery";
    loafSpots.value = "0";
  } else if (!isOther) {
    priceInput.value = "";
    taxCategory.value = "home_bakery";
    loafSpots.value = "0";
  }

  row.dataset.selectedProductId = productSelect.value;
}

function refreshManualRowTotals(row) {
  const productSelect = row.querySelector("[data-manual-product-select]");
  const productDetails = row.querySelector("[data-manual-product-details]");
  const product = productById(productSelect.value);

  if (!product || productDetails.hidden) return;

  const quantity = Number(row.querySelector("[data-manual-item-quantity]").value || 0);
  const loafSpotsEach = Number(product.capacity_units || 0);
  const rowLoafSpots = quantity * loafSpotsEach;

  productDetails.innerHTML = `
    <span>Price each: <strong>${money(product.price_cents)}</strong></span>
    <span>Loaf spots: <strong>${rowLoafSpots}</strong> total (${loafSpotsEach} each)</span>
    <span>${taxCategoryLabel(product.tax_category)}</span>
  `;
}

function manualOrderItems() {
  return [...el.manualItemsList.querySelectorAll(".manual-item-row")]
    .map(row => {
      const selectedProductId = row.querySelector("[data-manual-product-select]").value;
      const product = productById(selectedProductId);
      const isOther = selectedProductId === "other";
      const quantity = Number(row.querySelector("[data-manual-item-quantity]").value || 0);
      const unitPriceCents = product
        ? product.price_cents
        : dollarsToCents(row.querySelector("[data-manual-item-price]").value);
      const loafSpotsEach = product
        ? Number(product.capacity_units || 0)
        : Number(row.querySelector("[data-manual-item-loaf-spots]").value || 0);

      return {
        name: product
          ? (product.display_group && product.option_label ? `${product.display_group} - ${product.option_label}` : product.name)
          : row.querySelector("[data-manual-item-name]").value.trim(),
        quantity,
        unit_price_cents: unitPriceCents,
        tax_category: product ? (product.tax_category || "home_bakery") : row.querySelector("[data-manual-item-tax-category]").value,
        loaf_spots: quantity * loafSpotsEach,
        is_other: isOther
      };
    })
    .filter(item => item.name || item.quantity || item.unit_price_cents);
}

function updateManualOrderSubtotal() {
  el.manualItemsList.querySelectorAll(".manual-item-row").forEach(refreshManualRowTotals);
  const items = manualOrderItems();
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price_cents || 0)), 0);
  const discount = Math.min(dollarsToCents(el.manualDiscount.value), subtotal);
  const loafSpots = items.reduce((sum, item) => sum + Number(item.loaf_spots || 0), 0);
  el.manualOrderSubtotal.textContent = money(subtotal);
  el.manualOrderDiscount.textContent = `-${money(discount)}`;
  el.manualOrderAfterDiscount.textContent = money(Math.max(subtotal - discount, 0));
  el.manualOrderLoafSpots.textContent = loafSpots;
}

function clearManualOrderForm() {
  const selectedDate = el.manualPickupDate.value;
  el.manualOrderForm.reset();
  el.manualPickupDate.value = selectedDate;
  el.manualItemsList.innerHTML = "";
  addManualItemRow();
  updateManualOrderSubtotal();
}

async function saveManualOrder(event) {
  event.preventDefault();

  const items = manualOrderItems();
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price_cents || 0)), 0);
  const discountCents = dollarsToCents(el.manualDiscount.value);
  const invalidItem = items.find(item =>
    !item.name || item.quantity <= 0 || item.unit_price_cents < 0 || item.loaf_spots < 0
  );

  if (!items.length || invalidItem) {
    setMessage(el.manualOrderMessage, "Add at least one item with a name, quantity, and price.", "error");
    return;
  }

  if (discountCents > subtotal) {
    setMessage(el.manualOrderMessage, "Discount cannot be more than the subtotal.", "error");
    el.manualDiscount.focus();
    return;
  }

  const submitButton = el.manualOrderForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setMessage(el.manualOrderMessage, "Saving in-person order...");

  const { data, error } = await supabaseClient.rpc("admin_create_manual_order", {
    p_pickup_date_id: el.manualPickupDate.value,
    p_customer_name: el.manualCustomerName.value.trim(),
    p_customer_email: el.manualCustomerEmail.value.trim() || null,
    p_customer_phone: el.manualCustomerPhone.value.trim(),
    p_notes: el.manualNotes.value.trim(),
    p_payment_method: el.manualPaymentMethod.value,
    p_payment_status: el.manualPaymentStatus.value,
    p_fulfillment_status: el.manualFulfillmentStatus.value,
    p_total_loaves: items.reduce((sum, item) => sum + Number(item.loaf_spots || 0), 0),
    p_discount_cents: discountCents,
    p_items: items
  });

  submitButton.disabled = false;

  if (error) {
    setMessage(el.manualOrderMessage, error.message, "error");
    return;
  }

  const savedOrder = Array.isArray(data) ? data[0] : data;
  clearManualOrderForm();
  setMessage(el.manualOrderMessage, `Saved order ${savedOrder?.order_code || ""}.`, "success");
  await Promise.all([loadOrders(), loadPickupDates()]);
}

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
      ${bakingBreakdownMarkup(dateOrders)}
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

function bakingBreakdownMarkup(orders) {
  const itemTotals = new Map();
  const activeOrders = orders.filter(order => !order.archived && order.fulfillment_status !== "canceled");

  activeOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const itemName = adminItemName(item);
      itemTotals.set(itemName, (itemTotals.get(itemName) || 0) + Number(item.quantity || 0));
    });
  });

  const items = [...itemTotals.entries()]
    .filter(([, quantity]) => quantity > 0)
    .sort(([firstName], [secondName]) => firstName.localeCompare(secondName));

  if (!items.length) {
    return `
      <aside class="baking-breakdown">
        <h4>Active Orders Breakdown</h4>
        <p>No active items to bake for this date.</p>
      </aside>
    `;
  }

  return `
    <aside class="baking-breakdown">
      <h4>Active Orders Breakdown</h4>
      <table class="baking-breakdown-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(([name, quantity]) => `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td>${quantity}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </aside>
  `;
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
        ${order.discount_cents ? `<div><dt>Coupon</dt><dd>${order.coupon_code} (${couponAppliesToLabel(order.coupon_applies_to)}) -${money(order.discount_cents)}</dd></div>` : ""}
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
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
  renderManualOrderDateOptions();
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
  refreshManualProductSelects();
  setMessage(el.productAdminMessage, `${state.products.length} product${state.products.length === 1 ? "" : "s"} shown.`, "success");
}

async function loadTaxSettings() {
  const { data, error } = await supabaseClient.rpc("admin_get_tax_settings");

  if (error) {
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  const settings = Array.isArray(data) ? data[0] : data;
  state.taxSettings = settings;
  el.taxEnabledInput.checked = Boolean(settings?.tax_enabled);
  el.taxBusinessStateInput.value = settings?.business_state || "NV";
}

async function saveTaxSettings(event) {
  event.preventDefault();
  setMessage(el.productAdminMessage, "Saving tax settings...");

  const { error } = await supabaseClient.rpc("admin_save_tax_settings", {
    p_tax_enabled: el.taxEnabledInput.checked,
    p_business_state: el.taxBusinessStateInput.value
  });

  if (error) {
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  setMessage(el.productAdminMessage, "Tax settings saved.", "success");
  await loadTaxSettings();
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
                - ${taxCategoryLabel(product.tax_category)}
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
              <label>
                Tax type
                <select data-product-tax-category data-previous-value="${product.tax_category || "home_bakery"}">
                  ${option("home_bakery", "Home bakery food", product.tax_category || "home_bakery")}
                  ${option("general_product", "General product", product.tax_category || "home_bakery")}
                </select>
              </label>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  el.productsList.querySelectorAll("[data-product-active], [data-product-shippable], [data-product-tax-category]").forEach(input => {
    input.addEventListener("change", saveProductFlags);
  });
}

async function saveProductFlags(event) {
  const input = event.currentTarget;
  const row = input.closest("[data-product-id]");
  const previousValue = input.type === "checkbox" ? !input.checked : input.dataset.previousValue;

  input.disabled = true;
  setMessage(el.productAdminMessage, "Saving product settings...");

  const { error } = await supabaseClient.rpc("admin_update_product_flags", {
    p_product_id: row.dataset.productId,
    p_active: row.querySelector("[data-product-active]").checked,
    p_shippable: row.querySelector("[data-product-shippable]").checked,
    p_tax_category: row.querySelector("[data-product-tax-category]").value
  });

  input.disabled = false;

  if (error) {
    if (input.type === "checkbox") {
      input.checked = previousValue;
    } else {
      input.value = previousValue || "home_bakery";
    }
    setMessage(el.productAdminMessage, error.message, "error");
    return;
  }

  if (input.tagName === "SELECT") {
    input.dataset.previousValue = input.value;
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

function couponAppliesToLabel(value) {
  return {
    items: "items",
    shipping: "shipping",
    order: "whole order"
  }[value] || "items";
}

function taxCategoryLabel(value) {
  return value === "general_product" ? "general product tax" : "home bakery tax";
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
          - Applies to ${couponAppliesToLabel(coupon.applies_to)}
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
  el.couponAppliesToInput.value = coupon.applies_to || "items";
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
  el.couponAppliesToInput.value = "items";
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
    p_applies_to: el.couponAppliesToInput.value,
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
