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
  bakeryName: "Jen's Home Baked Goods",
  intro:
    "Small-batch bread baked to order. Choose a future pickup date, reserve your loaves, then choose your payment option.",
  pickupNote: "Pickup address and timing details will be confirmed after your order is received.",
  maxLoavesPerDate: 14,
  orderCutoffWeekday: 3, // 0 = Sunday, 3 = Wednesday.
  orderCutoffHour: 17,
  bakeryTimeZone: "America/Los_Angeles",
  paymentOptions: {
    Venmo: {
      label: "Venmo",
      link: "https://venmo.com/u/Jeni-Hales",
      instructions: "Send payment by Venmo and include your order number in the note."
    },
    Zelle: {
      label: "Zelle",
      link: "",
      instructions: "Send payment by Zelle to 801-602-8443. Add your order number in the memo."
    },
    PayPal: {
      label: "PayPal",
      link: "https://paypal.me/JeniHales",
      instructions: "Send payment by PayPal and include your order number in the note."
    },
    CashApp: {
      label: "CashApp",
      link: "https://cash.app/$JeniHales10",
      instructions: "Send payment by CashApp and include your order number in the note."
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
  isSubmitting: false
};

const el = {
  bakeryName: document.querySelector("[data-bakery-name]"),
  intro: document.querySelector("[data-store-intro]"),
  pickupNote: document.querySelector("[data-pickup-note]"),
  dateCapacity: document.querySelector("[data-date-capacity]"),
  dateList: document.querySelector("#date-list"),
  dateStatus: document.querySelector("#date-status"),
  menuSection: document.querySelector("#menu-section"),
  customerSection: document.querySelector("#customer-section"),
  productList: document.querySelector("#product-list"),
  capacityMessage: document.querySelector("#capacity-message"),
  selectedCount: document.querySelector("#selected-count"),
  orderTotal: document.querySelector("#order-total"),
  form: document.querySelector("#order-form"),
  formMessage: document.querySelector("#form-message"),
  submit: document.querySelector("#submit-order"),
  successSection: document.querySelector("#success-section"),
  successContent: document.querySelector("#success-content"),
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

function selectedTotalCents() {
  return state.products.reduce((sum, product) => {
    return sum + (state.quantities[product.id] || 0) * product.price_cents;
  }, 0);
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

function applyStoreSettings() {
  document.title = `${STORE_SETTINGS.bakeryName} | Bread Orders`;
  el.bakeryName.textContent = STORE_SETTINGS.bakeryName;
  el.intro.textContent = STORE_SETTINGS.intro;
  el.pickupNote.textContent = STORE_SETTINGS.pickupNote;
  el.dateCapacity.textContent = STORE_SETTINGS.maxLoavesPerDate;

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
        .order("sort_order", { ascending: true })
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

  el.dateStatus.textContent = `Each pickup date has its own ${STORE_SETTINGS.maxLoavesPerDate}-loaf capacity.`;

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

  el.menuSection.hidden = false;
  el.customerSection.hidden = false;
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

  state.products.forEach(product => {
    state.quantities[product.id] = state.quantities[product.id] || 0;

    const card = document.createElement("article");
    card.className = "product";

    card.innerHTML = `
      <div>
        <h3>${product.name}</h3>
        <p>${product.description || ""}</p>
      </div>
      <div class="product-bottom">
        <strong>${money(product.price_cents)}</strong>
        <div class="quantity" aria-label="${product.name} quantity">
          <button type="button" data-action="minus" aria-label="Remove one ${product.name}">-</button>
          <span data-qty>0</span>
          <button type="button" data-action="plus" aria-label="Add one ${product.name}">+</button>
        </div>
      </div>
    `;

    const qtyEl = card.querySelector("[data-qty]");
    const minusButton = card.querySelector('[data-action="minus"]');
    const plusButton = card.querySelector('[data-action="plus"]');

    function syncQuantity() {
      qtyEl.textContent = state.quantities[product.id];
      minusButton.disabled = state.quantities[product.id] === 0;
      plusButton.disabled = selectedQuantity() >= remainingForSelectedDate();
    }

    minusButton.addEventListener("click", () => {
      if (state.quantities[product.id] > 0) {
        state.quantities[product.id]--;
        updateSummary();
        renderProducts();
      }
    });

    plusButton.addEventListener("click", () => {
      const remaining = remainingForSelectedDate();

      if (selectedQuantity() >= remaining) {
        setMessage(
          `Only ${remaining} loaf spot${remaining === 1 ? "" : "s"} remain for this pickup date.`,
          "error"
        );
        return;
      }

      state.quantities[product.id]++;
      setMessage();
      updateSummary();
      renderProducts();
    });

    syncQuantity();
    el.productList.appendChild(card);
  });
}

function updateSummary() {
  if (!state.selectedDate) return;

  const remaining = remainingForSelectedDate();
  const count = selectedQuantity();

  el.capacityMessage.textContent =
    `${remaining} of ${state.selectedDate.capacity} loaf spots are currently available for ${prettyDate(state.selectedDate.pickup_date)}.`;

  el.selectedCount.textContent = count;
  el.orderTotal.textContent = money(selectedTotalCents());
}

el.form.addEventListener("submit", async event => {
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

  if (!paymentMethod) {
    setMessage("Please choose a payment option.", "error");
    return;
  }

  const items = state.products
    .filter(product => (state.quantities[product.id] || 0) > 0)
    .map(product => ({
      product_id: product.id,
      quantity: state.quantities[product.id]
    }));

  state.isSubmitting = true;
  el.submit.disabled = true;
  setMessage("Submitting your order...", "");

  const { data, error } = await supabaseClient.rpc("place_order", {
    p_pickup_date_id: state.selectedDate.id,
    p_customer_name: document.querySelector("#customer-name").value.trim(),
    p_customer_email: document.querySelector("#customer-email").value.trim(),
    p_customer_phone: document.querySelector("#customer-phone").value.trim(),
    p_notes: document.querySelector("#customer-notes").value.trim(),
    p_payment_method: paymentMethod,
    p_items: items
  });

  state.isSubmitting = false;
  el.submit.disabled = false;

  if (error) {
    console.error(error);

    const message = error.message.includes("Not enough capacity")
      ? "That pickup date filled up while you were ordering. Please choose another date or reduce your quantity."
      : "Your order could not be submitted. Please check your details and try again.";

    setMessage(message, "error");
    await refreshSelectedDate();
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  showSuccess(result, paymentMethod);
  await refreshSelectedDate();
});

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

function showSuccess(result, paymentMethod) {
  el.menuSection.hidden = true;
  el.customerSection.hidden = true;
  el.successSection.hidden = false;

  const payment = STORE_SETTINGS.paymentOptions[paymentMethod];
  const linkIsUsable = /^https?:\/\//.test(payment?.link || "");
  const paymentAction = linkIsUsable
    ? `<a class="payment-link" href="${payment.link}" target="_blank" rel="noopener">Open ${payment.label}</a>`
    : "";

  el.successContent.innerHTML = `
    <dl class="receipt">
      <div><dt>Pickup</dt><dd>${prettyDate(state.selectedDate.pickup_date)}</dd></div>
      <div><dt>Order number</dt><dd>${result.order_id}</dd></div>
      <div><dt>Total</dt><dd>${money(result.total_cents)}</dd></div>
      <div><dt>Payment</dt><dd>${payment.label}</dd></div>
    </dl>
    <p>${payment.instructions}</p>
    ${paymentAction}
  `;

  el.form.reset();
  state.quantities = {};
  window.scrollTo({ top: 0, behavior: "smooth" });
}

loadStore();
