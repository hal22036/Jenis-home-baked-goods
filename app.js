/*
  Bakery owner setup:
  1. Run supabase.sql in your Supabase project.
  2. Replace SUPABASE_URL and SUPABASE_ANON_KEY with your public API values.
  3. Edit STORE_SETTINGS for your bakery name, pickup notes, and payment links.

  Never put a Supabase service_role key or private bank credentials in this file.
*/

const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";

const STORE_SETTINGS = {
  bakeryName: "Jeni's Home Baked Goods",
  intro:
    "Small-batch bread baked to order. Choose a future pickup date, reserve your loaves, then choose your payment option.",
  pickupWindow: "4-7 pm",
  pickupAddress: "7140 Anchor Terrace St.",
  gateCode: "#7716",
  contactPhone: "801-602-8443",
  pickupNote: "Pickup details are shown after your order is submitted.",
  maxLoavesPerDate: 14,
  orderCutoffWeekday: 3, // 0 = Sunday, 3 = Wednesday.
  orderCutoffHour: 17,
  bakeryTimeZone: "America/Los_Angeles",
  categoryOrder: [
    "Everyday",
    "Sweet",
    "Savory",
    "Turn Up the Heat",
    "Other Delicious Treats"
  ],
  paymentOptions: {
    Venmo: {
      label: "Venmo",
      link: "https://venmo.com/u/Jeni-Hales",
      instructions: "Send payment by Venmo and include your order code in the note."
    },
    Zelle: {
      label: "Zelle",
      link: "",
      instructions: "Send payment by Zelle to 801-602-8443. Add your order code in the memo."
    },
    PayPal: {
      label: "PayPal",
      link: "https://paypal.me/JeniHales",
      instructions: "Send payment by PayPal and include your order code in the note."
    },
    CashApp: {
      label: "CashApp",
      link: "https://cash.app/$JeniHales10",
      instructions: "Send payment by CashApp and include your order code in the note."
    },
    CashAtPickup: {
      label: "Cash at Pickup",
      link: "",
      instructions: "Please bring exact cash at pickup, as change is not available."
    }
  }
};

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  dates: [],
  products: [],
  selectedDate: null,
  quantities: {},
  lastOrder: null,
  isSubmitting: false
};

const el = {
  intro: document.querySelector("[data-store-intro]"),
  pickupNote: document.querySelector("[data-pickup-note]"),
  dateList: document.querySelector("#date-list"),
  dateSection: document.querySelector("#date-section"),
  dateStatus: document.querySelector("#date-status"),
  menuSection: document.querySelector("#menu-section"),
  customerSection: document.querySelector("#customer-section"),
  productList: document.querySelector("#product-list"),
  capacityMessage: document.querySelector("#capacity-message"),
  selectedCount: document.querySelector("#selected-count"),
  orderTotal: document.querySelector("#order-total"),
  form: document.querySelector("#order-form"),
  formMessage: document.querySelector("#form-message"),
  customerPhone: document.querySelector("#customer-phone"),
  submit: document.querySelector("#submit-order"),
  reviewSection: document.querySelector("#review-section"),
  reviewContent: document.querySelector("#review-content"),
  invoiceRequested: document.querySelector("#invoice-requested"),
  invoiceEmailField: document.querySelector("#invoice-email-field"),
  invoiceEmail: document.querySelector("#invoice-email"),
  editOrder: document.querySelector("#edit-order"),
  confirmOrder: document.querySelector("#confirm-order"),
  reviewMessage: document.querySelector("#review-message"),
  successSection: document.querySelector("#success-section"),
  successContent: document.querySelector("#success-content"),
  copyMessage: document.querySelector("#copy-message"),
  paymentChoices: document.querySelector("#payment-choices")
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
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function formatPhone(value) {
  const digits = phoneDigits(value);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function syncPhoneFormat() {
  el.customerPhone.value = formatPhone(el.customerPhone.value);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bakeryDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_SETTINGS.bakeryTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function comparableDateTime(parts) {
  return Number(`${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`);
}

function cutoffForPickupDate(pickupDateString) {
  const [year, month, day] = pickupDateString.split("-").map(Number);
  const pickupDate = new Date(year, month - 1, day);
  const daysSinceCutoff =
    (pickupDate.getDay() - STORE_SETTINGS.orderCutoffWeekday + 7) % 7;

  pickupDate.setDate(pickupDate.getDate() - daysSinceCutoff);

  return {
    year: String(pickupDate.getFullYear()),
    month: String(pickupDate.getMonth() + 1).padStart(2, "0"),
    day: String(pickupDate.getDate()).padStart(2, "0"),
    hour: String(STORE_SETTINGS.orderCutoffHour).padStart(2, "0"),
    minute: "00"
  };
}

function isOrderablePickupDate(date) {
  const remaining = remainingFor(date);
  const now = comparableDateTime(bakeryDateTimeParts());
  const cutoff = comparableDateTime(cutoffForPickupDate(date.pickup_date));

  return date.is_open && remaining > 0 && now < cutoff;
}

function isPlaceholder(value) {
  return !value || value.includes("YOUR_");
}

function selectedQuantity() {
  return Object.values(state.quantities).reduce((sum, qty) => sum + qty, 0);
}

function capacityUnitsFor(product) {
  return Number.isInteger(product.capacity_units) ? product.capacity_units : 1;
}

function selectedCapacityUnits() {
  return state.products.reduce((sum, product) => {
    return sum + (state.quantities[product.id] || 0) * capacityUnitsFor(product);
  }, 0);
}

function selectedTotalCents() {
  return state.products.reduce((sum, product) => {
    return sum + (state.quantities[product.id] || 0) * product.price_cents;
  }, 0);
}

function categoryFor(product) {
  return product.category || "Everyday";
}

function categorySortIndex(category) {
  const index = STORE_SETTINGS.categoryOrder.indexOf(category);
  return index === -1 ? STORE_SETTINGS.categoryOrder.length : index;
}

function compareText(a = "", b = "") {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareSortOrder(a, b) {
  const aSort = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
  const bSort = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;

  return aSort - bSort;
}

function compareCardOrder(a, b) {
  const aPrice = Math.min(...a.map(product => product.price_cents));
  const bPrice = Math.min(...b.map(product => product.price_cents));

  return aPrice - bPrice || compareText(cardTitleFor(a[0]), cardTitleFor(b[0]));
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeAttribute(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function explicitGroupFor(product) {
  return cleanText(product.display_group);
}

function inferredGroupFor(product) {
  const name = cleanText(product.name);
  const dashedName = name.match(/^(.+?)\s+-\s+(.+)$/);

  if (dashedName) return dashedName[1].trim();

  const sizedName = splitSizedName(name);

  if (sizedName) return sizedName.groupName;

  return "";
}

function groupNameFor(product) {
  return explicitGroupFor(product) || inferredGroupFor(product);
}

function cardKeyFor(product) {
  const groupName = groupNameFor(product);
  return groupName ? groupName.toLocaleLowerCase() : product.id;
}

function cardTitleFor(product) {
  return groupNameFor(product) || cleanText(product.name);
}

function displayNameFor(product) {
  const groupName = groupNameFor(product);
  const optionLabel = optionLabelFor(product);

  if (groupName && optionLabel && optionLabel !== cleanText(product.name)) {
    return `${groupName} - ${optionLabel}`;
  }

  return cleanText(product.name);
}

function optionLabelFor(product) {
  const explicitOption = cleanText(product.option_label);
  if (explicitOption) return explicitOption;

  const name = cleanText(product.name);
  const dashedName = name.match(/^(.+?)\s+-\s+(.+)$/);

  if (dashedName) return dashedName[2].trim();

  const sizedName = splitSizedName(name);

  if (sizedName) return sizedName.optionLabel;

  return name;
}

function splitSizedName(name) {
  const parts = cleanText(name).split(/\s+/);
  const sizeIndex = parts.findIndex(part => /^\d+$/.test(part));
  const unit = parts[sizeIndex + 1]?.toLowerCase();

  if (sizeIndex <= 0 || !["oz", "ounce", "ounces"].includes(unit)) {
    return null;
  }

  return {
    groupName: parts.slice(0, sizeIndex).join(" "),
    optionLabel: parts.slice(sizeIndex).join(" ")
  };
}

function imageUrlFor(products) {
  const productWithImage = products.find(product => cleanText(product.image_url));
  return productWithImage ? cleanText(productWithImage.image_url) : "";
}

function productImageMarkup(products, altText) {
  const imageUrl = imageUrlFor(products);

  if (!imageUrl) return "";

  return `
    <img
      class="product-image"
      src="${escapeAttribute(imageUrl)}"
      alt="${escapeAttribute(altText)}"
      loading="lazy"
      onerror="this.hidden=true"
    />
  `;
}

function itemSubtotalCents(product) {
  return (state.quantities[product.id] || 0) * product.price_cents;
}

function cardSubtotalCents(products) {
  return products.reduce((sum, product) => sum + itemSubtotalCents(product), 0);
}

function remainingFor(date) {
  if (!date) return 0;
  return Math.max(date.capacity - date.ordered_count, 0);
}

function remainingForSelectedDate() {
  return remainingFor(state.selectedDate);
}

function setMessage(message = "", type = "") {
  el.formMessage.textContent = message;
  el.formMessage.className = type ? `message ${type}` : "message";
}

function setReviewMessage(message = "", type = "") {
  el.reviewMessage.textContent = message;
  el.reviewMessage.className = type ? `message ${type}` : "message";
}

function applyStoreSettings() {
  document.title = `${STORE_SETTINGS.bakeryName} | Bread Orders`;
  el.intro.textContent = STORE_SETTINGS.intro;
  el.pickupNote.textContent = STORE_SETTINGS.pickupNote;

  el.paymentChoices.innerHTML = Object.entries(STORE_SETTINGS.paymentOptions)
    .map(([value, option]) => `
      <label class="radio">
        <input type="radio" name="payment" value="${value}" required />
        <span>${option.label}</span>
      </label>
    `)
    .join("");
}

async function loadStore() {
  applyStoreSettings();

  if (isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_ANON_KEY)) {
    el.dateStatus.textContent =
      "Add your Supabase URL and anon key in app.js before using the live store.";
    el.dateStatus.className = "error";
    return;
  }

  const [{ data: dates, error: dateError }, { data: products, error: productError }] =
    await Promise.all([
      supabaseClient
        .from("pickup_date_status")
        .select("*")
        .gte("pickup_date", localDateString())
        .eq("is_open", true)
        .order("pickup_date", { ascending: true }),
      supabaseClient
        .from("products")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
    ]);

  if (dateError || productError) {
    console.error(dateError || productError);
    el.dateStatus.textContent = "Could not load the store. Please try again.";
    el.dateStatus.className = "error";
    return;
  }

  state.dates = dates || [];
  state.dates = state.dates.filter(isOrderablePickupDate);
  state.products = products || [];

  renderDates();
}

function renderDates() {
  el.dateList.innerHTML = "";

  if (!state.dates.length) {
    el.dateStatus.textContent =
      "There are no open future pickup dates right now. Add dates in Supabase when you are ready to take orders.";
    return;
  }

  el.dateStatus.textContent = "";

  state.dates.forEach(date => {
    const remaining = remainingFor(date);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-button";
    btn.disabled = remaining <= 0;
    btn.setAttribute("aria-pressed", state.selectedDate?.id === date.id ? "true" : "false");
    btn.innerHTML = `
      <strong>${prettyDate(date.pickup_date)}</strong>
      <span>${remaining > 0 ? `${remaining} loaf spot${remaining === 1 ? "" : "s"} left` : "Sold out"}</span>
    `;
    btn.addEventListener("click", () => selectDate(date.id));
    el.dateList.appendChild(btn);
  });
}

function selectDate(dateId) {
  state.selectedDate = state.dates.find(d => d.id === dateId);
  state.quantities = {};

  el.dateSection.hidden = false;
  el.intro.hidden = false;
  el.menuSection.hidden = false;
  el.customerSection.hidden = false;
  el.reviewSection.hidden = true;
  el.successSection.hidden = true;

  renderDates();
  renderProducts();
  updateSummary();
  setMessage();
}

function renderProducts() {
  el.productList.innerHTML = "";

  if (!state.products.length) {
    el.productList.innerHTML = "<p class=\"muted\">No active breads are listed yet.</p>";
    return;
  }

  const productsByCategory = state.products
    .slice()
    .sort((a, b) => {
      const categoryDifference =
        categorySortIndex(categoryFor(a)) - categorySortIndex(categoryFor(b));

      if (categoryDifference !== 0) return categoryDifference;

      return compareText(categoryFor(a), categoryFor(b));
    })
    .reduce((groups, product) => {
      const category = categoryFor(product);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(product);
      return groups;
    }, new Map());

  productsByCategory.forEach((products, category) => {
    const categorySection = document.createElement("section");
    categorySection.className = "product-category";
    categorySection.innerHTML = `
      <div class="category-heading">
        <h3>${category}</h3>
      </div>
      <div class="category-grid"></div>
    `;

    const categoryGrid = categorySection.querySelector(".category-grid");

    const productCards = products.reduce((cards, product) => {
      const key = cardKeyFor(product);
      if (!cards.has(key)) cards.set(key, []);
      cards.get(key).push(product);
      return cards;
    }, new Map());

    [...productCards.values()]
      .sort(compareCardOrder)
      .forEach(cardProducts => {
        cardProducts.forEach(product => {
          state.quantities[product.id] = state.quantities[product.id] || 0;
        });

        categoryGrid.appendChild(renderProductCard(cardProducts));
      });

    el.productList.appendChild(categorySection);
  });
}

function renderProductCard(products) {
  const card = document.createElement("article");
  const sortedProducts = products
    .slice()
    .sort((a, b) => compareSortOrder(a, b) || compareText(optionLabelFor(a), optionLabelFor(b)));
  const primaryProduct = sortedProducts[0];
  const groupName = groupNameFor(primaryProduct);
  const isGrouped = products.length > 1 || Boolean(groupName);
  card.className = `product ${isGrouped ? "option-product" : ""}`;

  if (!isGrouped) {
    card.innerHTML = `
      ${productImageMarkup([primaryProduct], primaryProduct.name)}
      <div>
        <h3>${primaryProduct.name}</h3>
        <p>${primaryProduct.description || ""}</p>
      </div>
      <div class="product-bottom">
        <div>
          <strong>${money(primaryProduct.price_cents)}</strong>
          <span class="item-subtotal">Item subtotal: ${money(itemSubtotalCents(primaryProduct))}</span>
        </div>
        <div class="quantity" aria-label="${primaryProduct.name} quantity">
          <button type="button" data-action="minus" data-product-id="${primaryProduct.id}" aria-label="Remove one ${primaryProduct.name}">-</button>
          <span data-qty="${primaryProduct.id}">${state.quantities[primaryProduct.id]}</span>
          <button type="button" data-action="plus" data-product-id="${primaryProduct.id}" aria-label="Add one ${primaryProduct.name}">+</button>
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      ${productImageMarkup(sortedProducts, groupName || primaryProduct.name)}
      <div class="option-card-heading">
        <div>
          <h3>${groupName || primaryProduct.name}</h3>
          <p>${primaryProduct.description || ""}</p>
        </div>
        <div class="group-subtotal">
          <span>Item subtotal</span>
          <strong>${money(cardSubtotalCents(sortedProducts))}</strong>
        </div>
      </div>
      <div class="option-table">
        <div class="option-table-head">
          <span>Option</span>
          <span>Quantity</span>
          <span>Price</span>
          <span>Subtotal</span>
        </div>
        ${sortedProducts.map(product => `
          <div class="option-row">
            <strong>${optionLabelFor(product)}</strong>
            <div class="option-controls">
              <div class="quantity" aria-label="${displayNameFor(product)} quantity">
                <button type="button" data-action="minus" data-product-id="${product.id}" aria-label="Remove one ${displayNameFor(product)}">-</button>
                <span data-qty="${product.id}">${state.quantities[product.id]}</span>
                <button type="button" data-action="plus" data-product-id="${product.id}" aria-label="Add one ${displayNameFor(product)}">+</button>
              </div>
              <span class="option-price">${money(product.price_cents)}</span>
              <span class="option-subtotal">${money(itemSubtotalCents(product))}</span>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="card-subtotal">
        <span>Item subtotal</span>
        <strong>${money(cardSubtotalCents(sortedProducts))}</strong>
      </div>
    `;
  }

  card.querySelectorAll("[data-action]").forEach(button => {
    const product = products.find(item => item.id === button.dataset.productId);
    button.disabled = isQuantityButtonDisabled(button.dataset.action, product);
    button.addEventListener("click", () => updateProductQuantity(button.dataset.action, product));
  });

  return card;
}

function isQuantityButtonDisabled(action, product) {
  if (action === "minus") return state.quantities[product.id] === 0;

  return (
    capacityUnitsFor(product) > 0 &&
    selectedCapacityUnits() + capacityUnitsFor(product) > remainingForSelectedDate()
  );
}

function updateProductQuantity(action, product) {
  if (action === "minus") {
    if (state.quantities[product.id] > 0) {
      state.quantities[product.id]--;
    }
  } else {
    const remaining = remainingForSelectedDate();
    const productCapacity = capacityUnitsFor(product);

    if (
      productCapacity > 0 &&
      selectedCapacityUnits() + productCapacity > remaining
    ) {
      setMessage(
        `Only ${remaining} loaf spot${remaining === 1 ? "" : "s"} remain for this pickup date.`,
        "error"
      );
      return;
    }

    state.quantities[product.id]++;
    setMessage();
  }

  updateSummary();
  renderProducts();
}

function updateSummary() {
  if (!state.selectedDate) return;

  const remaining = remainingForSelectedDate();
  const count = selectedCapacityUnits();

  el.capacityMessage.textContent =
    `${remaining} of ${state.selectedDate.capacity} loaf spots are currently available for ${prettyDate(state.selectedDate.pickup_date)}.`;

  el.selectedCount.textContent = count;
  el.orderTotal.textContent = money(selectedTotalCents());
}

el.customerPhone.addEventListener("input", syncPhoneFormat);
el.customerPhone.addEventListener("blur", syncPhoneFormat);

el.form.addEventListener("submit", event => {
  event.preventDefault();

  if (state.isSubmitting) return;

  const totalQty = selectedQuantity();

  if (!state.selectedDate) {
    setMessage("Please choose a pickup date.", "error");
    return;
  }

  if (totalQty < 1) {
    setMessage("Please add at least one loaf.", "error");
    return;
  }

  const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value;

  syncPhoneFormat();

  if (phoneDigits(el.customerPhone.value).length !== 10) {
    setMessage("Please enter a 10-digit phone number.", "error");
    el.customerPhone.focus();
    return;
  }

  if (!paymentMethod) {
    setMessage("Please choose a payment option.", "error");
    return;
  }

  showReview();
});

function selectedItemsWithDetails() {
  return state.products
    .filter(product => (state.quantities[product.id] || 0) > 0)
    .map(product => ({
      product_id: product.id,
      name: displayNameFor(product),
      quantity: state.quantities[product.id],
      price_cents: product.price_cents,
      capacity_units: capacityUnitsFor(product)
    }))
    .sort((a, b) => compareText(a.name, b.name));
}

function customerDetails() {
  return {
    name: document.querySelector("#customer-name").value.trim(),
    email: el.invoiceEmail.value.trim(),
    phone: formatPhone(el.customerPhone.value),
    notes: document.querySelector("#customer-notes").value.trim(),
    paymentMethod: document.querySelector('input[name="payment"]:checked')?.value
  };
}

function hasValidPaymentMethod(paymentMethod) {
  return Boolean(paymentMethod && STORE_SETTINGS.paymentOptions[paymentMethod]);
}

function updateInvoiceEmailField() {
  const invoiceRequested = el.invoiceRequested.checked;
  el.invoiceEmailField.hidden = !invoiceRequested;
  el.invoiceEmail.required = invoiceRequested;

  if (!invoiceRequested) {
    el.invoiceEmail.value = "";
  }
}

function showReview() {
  const details = customerDetails();

  if (!hasValidPaymentMethod(details.paymentMethod)) {
    setMessage("Please choose a payment option.", "error");
    return;
  }

  const payment = STORE_SETTINGS.paymentOptions[details.paymentMethod];
  const items = selectedItemsWithDetails();

  el.intro.hidden = true;
  el.dateSection.hidden = true;
  el.menuSection.hidden = true;
  el.customerSection.hidden = true;
  el.reviewSection.hidden = false;
  el.successSection.hidden = true;
  setReviewMessage();

  el.reviewContent.innerHTML = `
    <dl class="receipt invoice-receipt">
      <div><dt>Pickup</dt><dd>${prettyDate(state.selectedDate.pickup_date)}</dd></div>
      <div><dt>Name</dt><dd>${details.name}</dd></div>
      <div><dt>Phone</dt><dd>${details.phone}</dd></div>
      <div><dt>Payment</dt><dd>${payment.label}</dd></div>
      <div><dt>Loaf spots</dt><dd>${selectedCapacityUnits()}</dd></div>
    </dl>
    <div class="invoice-items">
      ${items.map(item => `
        <div>
          <span>${item.quantity}x ${item.name}</span>
          <span>${money(item.quantity * item.price_cents)}</span>
        </div>
      `).join("")}
    </div>
    ${details.notes ? `<p class="admin-notes"><strong>Questions/comments:</strong> ${details.notes}</p>` : ""}
    <div class="summary">
      <strong>Total</strong>
      <strong>${money(selectedTotalCents())}</strong>
    </div>
  `;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

el.editOrder.addEventListener("click", () => {
  el.intro.hidden = false;
  el.dateSection.hidden = false;
  el.menuSection.hidden = false;
  el.customerSection.hidden = false;
  el.reviewSection.hidden = true;
  el.successSection.hidden = true;
  window.scrollTo({ top: el.menuSection.offsetTop - 16, behavior: "smooth" });
});

el.confirmOrder.addEventListener("click", submitReviewedOrder);

el.invoiceRequested.addEventListener("change", () => {
  updateInvoiceEmailField();
  setReviewMessage();
});

async function submitReviewedOrder() {
  if (state.isSubmitting) return;

  const details = customerDetails();
  const invoiceRequested = el.invoiceRequested.checked;

  if (!hasValidPaymentMethod(details.paymentMethod)) {
    setMessage("Please choose a payment option before placing your order.", "error");
    el.reviewSection.hidden = true;
    el.customerSection.hidden = false;
    window.scrollTo({ top: el.customerSection.offsetTop - 16, behavior: "smooth" });
    return;
  }

  if (invoiceRequested && (!details.email || !el.invoiceEmail.checkValidity())) {
    setReviewMessage("Please enter a valid email address for the receipt.", "error");
    el.invoiceEmail.focus();
    return;
  }

  const items = state.products
    .filter(product => (state.quantities[product.id] || 0) > 0)
    .map(product => ({
      product_id: product.id,
      quantity: state.quantities[product.id]
    }));

  state.isSubmitting = true;
  el.confirmOrder.disabled = true;
  setReviewMessage("Submitting your order...", "");

  const { data, error } = await supabaseClient.rpc("place_order", {
    p_pickup_date_id: state.selectedDate.id,
    p_customer_name: details.name,
    p_customer_email: invoiceRequested ? details.email : null,
    p_customer_phone: details.phone,
    p_notes: details.notes,
    p_payment_method: details.paymentMethod,
    p_invoice_requested: invoiceRequested,
    p_items: items
  });

  state.isSubmitting = false;
  el.confirmOrder.disabled = false;

  if (error) {
    console.error(error);

    const message = error.message.includes("Not enough capacity")
      ? "That pickup date filled up while you were ordering. Please choose another date or reduce your quantity."
      : "Your order could not be submitted. Please check your details and try again.";

    setReviewMessage(message, "error");
    await refreshSelectedDate();
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  showSuccess(result, details.paymentMethod, invoiceRequested, selectedItemsWithDetails(), details);
  await refreshSelectedDate();
}

async function refreshSelectedDate() {
  if (!state.selectedDate) return;

  const { data } = await supabaseClient
    .from("pickup_date_status")
    .select("*")
    .eq("id", state.selectedDate.id)
    .single();

  if (data) {
    const index = state.dates.findIndex(d => d.id === data.id);
    if (index !== -1) state.dates[index] = data;
    state.selectedDate = data;
    renderDates();
    updateSummary();
    renderProducts();
  }
}

function showSuccess(result, paymentMethod, invoiceRequested, items, details) {
  el.intro.hidden = true;
  el.dateSection.hidden = true;
  el.menuSection.hidden = true;
  el.customerSection.hidden = true;
  el.reviewSection.hidden = true;
  el.successSection.hidden = false;

  state.lastOrder = {
    ...result,
    paymentMethod
  };

  el.successContent.innerHTML = `
    <dl class="receipt">
      <div><dt>Pickup</dt><dd>${prettyDate(state.selectedDate.pickup_date)}</dd></div>
      <div><dt>Order code</dt><dd>${result.order_code}</dd></div>
      <div><dt>Total</dt><dd>${money(result.total_cents)}</dd></div>
      <div><dt>Payment</dt><dd data-payment-label></dd></div>
      <div><dt>Receipt email</dt><dd>${invoiceRequested ? "Requested" : "Not requested"}</dd></div>
      ${invoiceRequested ? `<div><dt>Email</dt><dd>${details.email}</dd></div>` : ""}
    </dl>
    <div class="invoice-items">
      ${items.map(item => `
        <div>
          <span>${item.quantity}x ${item.name}</span>
          <span>${money(item.quantity * item.price_cents)}</span>
        </div>
      `).join("")}
    </div>
    ${details.notes ? `<p class="admin-notes"><strong>Questions/comments:</strong> ${details.notes}</p>` : ""}
    <button class="copy-button" type="button" data-copy-order-code="${result.order_code}">
      Copy order code
    </button>
    <button class="secondary-button" type="button" id="make-another-order">
      Make another order
    </button>
    <div class="pickup-details">
      <h3>Pickup details</h3>
      <p>
        Pickup is on ${prettyDate(state.selectedDate.pickup_date)} between ${STORE_SETTINGS.pickupWindow}.
      </p>
      <p>
        Address: ${STORE_SETTINGS.pickupAddress}<br>
        Gate Code: ${STORE_SETTINGS.gateCode}<br>
        Please call/text with any questions: ${STORE_SETTINGS.contactPhone}.
      </p>
    </div>
    <div id="success-payment-details"></div>
    <details class="edit-payment">
      <summary>Edit payment option</summary>
      <label>
        Payment option
        <select id="success-payment-select">
          ${Object.entries(STORE_SETTINGS.paymentOptions)
            .map(([value, option]) => `
              <option value="${value}" ${value === paymentMethod ? "selected" : ""}>
                ${option.label}
              </option>
            `)
            .join("")}
        </select>
      </label>
      <button class="secondary-button" type="button" id="save-payment-method">
        Save payment option
      </button>
      <p id="payment-edit-message" class="message" role="status"></p>
    </details>
  `;

  el.successContent
    .querySelector("[data-copy-order-code]")
    .addEventListener("click", copyOrderCode);
  el.successContent
    .querySelector("#make-another-order")
    .addEventListener("click", startAnotherOrder);
  el.successContent
    .querySelector("#save-payment-method")
    .addEventListener("click", saveSuccessPaymentMethod);

  renderSuccessPaymentDetails(paymentMethod);
  el.form.reset();
  el.invoiceRequested.checked = false;
  updateInvoiceEmailField();
  state.quantities = {};
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function startAnotherOrder() {
  state.lastOrder = null;
  state.selectedDate = null;
  state.quantities = {};

  el.successSection.hidden = true;
  el.dateSection.hidden = false;
  el.intro.hidden = false;
  el.menuSection.hidden = true;
  el.customerSection.hidden = true;
  el.reviewSection.hidden = true;
  el.successContent.innerHTML = "";
  el.copyMessage.textContent = "";

  await loadStore();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSuccessPaymentDetails(paymentMethod) {
  const payment = STORE_SETTINGS.paymentOptions[paymentMethod];
  const paymentLabel = el.successContent.querySelector("[data-payment-label]");
  const paymentDetails = el.successContent.querySelector("#success-payment-details");
  const linkIsUsable = /^https?:\/\//.test(payment?.link || "");
  const paymentAction = linkIsUsable
    ? `<a class="payment-link" href="${payment.link}" target="_blank" rel="noopener">Open ${payment.label}</a>`
    : "";

  paymentLabel.textContent = payment.label;
  paymentDetails.innerHTML = `
    <p>${payment.instructions}</p>
    ${paymentAction}
  `;
}

async function saveSuccessPaymentMethod() {
  if (!state.lastOrder) return;

  const select = el.successContent.querySelector("#success-payment-select");
  const message = el.successContent.querySelector("#payment-edit-message");
  const button = el.successContent.querySelector("#save-payment-method");
  const paymentMethod = select.value;

  button.disabled = true;
  message.textContent = "Saving payment option...";
  message.className = "message";

  const { error } = await supabaseClient.rpc("update_order_payment_method", {
    p_order_code: state.lastOrder.order_code,
    p_payment_method: paymentMethod
  });

  button.disabled = false;

  if (error) {
    console.error(error);
    message.textContent = `Could not update payment option: ${error.message}`;
    message.className = "message error";
    return;
  }

  state.lastOrder.paymentMethod = paymentMethod;
  renderSuccessPaymentDetails(paymentMethod);
  message.textContent = "Payment option updated.";
  message.className = "message success";
}

async function copyOrderCode(event) {
  const orderCode = event.currentTarget.dataset.copyOrderCode;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(orderCode);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = orderCode;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    el.copyMessage.textContent = "Order code copied.";
    el.copyMessage.className = "message success";
  } catch (error) {
    console.error(error);
    el.copyMessage.textContent = "Could not copy automatically. Select the order code and copy it manually.";
    el.copyMessage.className = "message error";
  }
}

loadStore();
