const SUPABASE_URL = "https://qvxrbipxxlygmmecgjxf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-w4Ef_bqgM_l9bY00thSpg_xohk7e9M";
const SYNC_TOKEN = "REPLACE_WITH_YOUR_GOOGLE_SHEET_SYNC_TOKEN";
const OWNER_EMAIL = "jenika19@hotmail.com";
const WEBSITE_URL = "https://jenisgoods.com";
const PICKUP_DETAILS = "Pickup is between 4-7 pm at 7140 Anchor Terrace St. Gate Code: #7716.";
const CONTACT_PHONE = "801-602-8443";
const EMAIL_OWNER_NEW_ORDERS = true;
const EMAIL_CUSTOMER_INVOICES = true;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Jeni's Orders")
    .addItem("Sync Website Orders", "syncWebsiteOrders")
    .addSeparator()
    .addItem("Install 15-minute auto sync", "installAutomaticSync")
    .addItem("Remove auto sync", "removeAutomaticSync")
    .addToUi();
}

function syncWebsiteOrders() {
  Logger.log("Sync started");

  const spreadsheet = SpreadsheetApp.getActive();
  const ordersSheet = spreadsheet.getSheetByName("Orders");
  const orderItemsSheet = spreadsheet.getSheetByName("Order Items");

  if (!ordersSheet || !orderItemsSheet) {
    throw new Error("Could not find the Orders and Order Items sheets.");
  }

  const websiteOrders = fetchWebsiteOrders();
  Logger.log(`Fetched ${websiteOrders.length} website orders`);

  ensureWebsiteSyncColumns(ordersSheet);

  const existingRows = existingWebsiteOrderRows(ordersSheet);
  const newOrders = websiteOrders.filter(order => !existingRows.has(order.order_code));
  const updatedOrders = websiteOrders.filter(order => existingRows.has(order.order_code));
  Logger.log(`Found ${newOrders.length} new orders`);
  Logger.log(`Found ${updatedOrders.length} existing orders to refresh`);

  if (websiteOrders.length) {
    const orderRowsByCode = upsertOrdersToSheet(ordersSheet, websiteOrders, existingRows);
    replaceWebsiteOrderItems(orderItemsSheet, websiteOrders, orderRowsByCode);

    if (EMAIL_OWNER_NEW_ORDERS) {
      newOrders.forEach(sendOwnerOrderEmail);
    }
  }

  if (EMAIL_CUSTOMER_INVOICES) {
    emailRequestedInvoices(websiteOrders);
  }

  Logger.log(`Sync complete. Added ${newOrders.length} and refreshed ${updatedOrders.length} website order${updatedOrders.length === 1 ? "" : "s"}.`);
}

function syncWebsiteOrdersSafe() {
  try {
    syncWebsiteOrders();
  } catch (error) {
    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: "Website order sync failed",
      body: `The website order sync failed.\n\n${error.stack || error.message || error}`
    });

    throw error;
  }
}

function installAutomaticSync() {
  removeAutomaticSync();
  ScriptApp.newTrigger("syncWebsiteOrdersSafe").timeBased().everyMinutes(15).create();
  Logger.log("Installed 15-minute auto sync.");
}

function removeAutomaticSync() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => ["syncWebsiteOrders", "syncWebsiteOrdersSafe"].includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  Logger.log("Removed auto sync triggers.");
}

function upsertOrdersToSheet(ordersSheet, websiteOrders, existingRows) {
  let nextOrderId = nextNumericOrderId(ordersSheet);
  let nextOrderRow = lastFilledRow(ordersSheet, 1) + 1;
  const orderRowsByCode = new Map(existingRows);
  const rowsToWrite = [];

  websiteOrders.forEach(order => {
    const existingOrder = existingRows.get(order.order_code);
    const orderId = existingOrder ? existingOrder.orderId : nextOrderId++;
    const orderDate = localDate(order.pickup_date);
    const orderRowNumber = existingOrder ? existingOrder.row : nextOrderRow++;
    const fulfillmentStatus = String(order.fulfillment_status || "").toLowerCase();
    const isCanceled = fulfillmentStatus === "canceled";
    const discountCents = Number(order.discount_cents || 0);
    const taxCents = Number(order.tax_cents || 0);
    const shippingCents = Number(order.shipping_cents || 0);
    const adjustmentCents = isCanceled ? 0 : taxCents + shippingCents - discountCents;
    const notes = [
      order.notes || "",
      `Method: ${fulfillmentLabel(order.fulfillment_method)}`,
      order.shipping_address ? `Shipping address: ${order.shipping_address}` : "",
      discountCents ? `Coupon ${order.coupon_code} (${couponAppliesToLabel(order.coupon_applies_to)}): -${money(discountCents)}` : "",
      taxCents ? `Tax: ${money(taxCents)}` : "",
      shippingCents ? `Shipping: ${money(shippingCents)}` : "",
      isCanceled ? "Canceled in website admin" : ""
    ]
      .filter(Boolean)
      .join(" | ");

    const orderRow = [
      orderId,
      orderDate,
      order.customer_name || "",
      paymentLabel(order.payment_method),
      adjustmentCents ? centsToDollars(adjustmentCents) : "",
      `=IF(A${orderRowNumber}="","",SUMIF('Order Items'!$A:$A,A${orderRowNumber},'Order Items'!$G:$G))`,
      `=IF(A${orderRowNumber}="","",F${orderRowNumber}+N(E${orderRowNumber}))`,
      `=IF(A${orderRowNumber}="","",SUMIF('Order Items'!$A:$A,A${orderRowNumber},'Order Items'!$H:$H))`,
      `=IF(G${orderRowNumber}="","",G${orderRowNumber}-H${orderRowNumber})`,
      notes,
      order.order_code,
      statusLabel(order.payment_status),
      statusLabel(order.fulfillment_status),
      invoiceStatusLabel(order),
      order.archived ? "Yes" : "No",
      new Date()
    ];

    rowsToWrite.push({ row: orderRowNumber, values: orderRow });
    orderRowsByCode.set(order.order_code, { row: orderRowNumber, orderId });
  });

  rowsToWrite.forEach(entry => {
    ordersSheet.getRange(entry.row, 1, 1, entry.values.length).setValues([entry.values]);
  });

  Logger.log(`Wrote ${rowsToWrite.length} website order row${rowsToWrite.length === 1 ? "" : "s"}`);
  return orderRowsByCode;
}

function replaceWebsiteOrderItems(orderItemsSheet, websiteOrders, orderRowsByCode) {
  const websiteOrderCodes = new Set(websiteOrders.map(order => order.order_code));
  deleteExistingWebsiteOrderItems(orderItemsSheet, websiteOrderCodes);

  const itemRows = [];
  let nextItemRow = lastFilledRow(orderItemsSheet, 1) + 1;

  websiteOrders
    .filter(order => String(order.fulfillment_status || "").toLowerCase() !== "canceled")
    .forEach(order => {
      const orderRow = orderRowsByCode.get(order.order_code);
      if (!orderRow) return;

      const orderId = orderRow.orderId;
      const orderDate = localDate(order.pickup_date);
      const orderNotes = sheetOrderNotes(order);

      (order.items || []).forEach(item => {
        const itemRowNumber = nextItemRow++;

        itemRows.push([
          orderId,
          orderDate,
          item.product_name || "",
          Number(item.quantity || 0),
          centsToDollars(item.unit_price_cents),
          productCostFormula(itemRowNumber),
          `=IF(OR(D${itemRowNumber}="",E${itemRowNumber}=""),"",D${itemRowNumber}*E${itemRowNumber})`,
          `=IF(OR(D${itemRowNumber}="",F${itemRowNumber}=""),"",D${itemRowNumber}*F${itemRowNumber})`,
          `=IF(G${itemRowNumber}="","",G${itemRowNumber}-H${itemRowNumber})`,
          order.order_code,
          orderNotes
        ]);
      });
    });

  if (!itemRows.length) {
    Logger.log("No active website order item rows to write.");
    return;
  }

  const startRow = nextItemRow - itemRows.length;
  Logger.log(`Writing ${itemRows.length} refreshed item rows`);
  orderItemsSheet.getRange(startRow, 1, itemRows.length, 11).setValues(itemRows);
}

function deleteExistingWebsiteOrderItems(sheet, websiteOrderCodes) {
  const lastRow = lastFilledRow(sheet, 1);
  if (lastRow < 2 || !websiteOrderCodes.size) return;

  const orderCodes = sheet.getRange(2, 10, lastRow - 1, 1).getValues().flat();
  let deleted = 0;

  for (let index = orderCodes.length - 1; index >= 0; index -= 1) {
    const code = String(orderCodes[index] || "").trim();
    if (websiteOrderCodes.has(code)) {
      sheet.deleteRow(index + 2);
      deleted += 1;
    }
  }

  Logger.log(`Deleted ${deleted} existing website order item row${deleted === 1 ? "" : "s"}.`);
}

function sheetOrderNotes(order) {
  const discountCents = Number(order.discount_cents || 0);
  const taxCents = Number(order.tax_cents || 0);
  const shippingCents = Number(order.shipping_cents || 0);

  return [
    order.notes || "",
    `Method: ${fulfillmentLabel(order.fulfillment_method)}`,
    order.shipping_address ? `Shipping address: ${order.shipping_address}` : "",
    discountCents ? `Coupon ${order.coupon_code} (${couponAppliesToLabel(order.coupon_applies_to)}): -${money(discountCents)}` : "",
    taxCents ? `Tax: ${money(taxCents)}` : "",
    shippingCents ? `Shipping: ${money(shippingCents)}` : "",
    String(order.fulfillment_status || "").toLowerCase() === "canceled" ? "Canceled in website admin" : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

function fetchWebsiteOrders() {
  return callSupabaseRpc("get_sheet_sync_orders", {
    p_sync_token: SYNC_TOKEN
  });
}

function markInvoiceSent(orderCode) {
  callSupabaseRpc("mark_sheet_invoice_sent", {
    p_sync_token: SYNC_TOKEN,
    p_order_code: orderCode
  });
}

function callSupabaseRpc(functionName, payload) {
  const response = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Supabase ${functionName} failed: ${statusCode} ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

function sendOwnerOrderEmail(order) {
  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: `New website order ${order.order_code} for ${formatDate(order.pickup_date)}`,
    htmlBody: ownerOrderHtml(order),
    body: plainOrderText(order)
  });

  Logger.log(`Owner email sent for ${order.order_code}`);
}

function emailRequestedInvoices(orders) {
  const invoiceOrders = orders.filter(order =>
    order.invoice_requested &&
    !order.invoice_sent &&
    order.customer_email
  );

  Logger.log(`Found ${invoiceOrders.length} requested invoice email${invoiceOrders.length === 1 ? "" : "s"} to send`);

  invoiceOrders.forEach(order => {
    MailApp.sendEmail({
      to: order.customer_email,
      subject: `Jeni's order ${order.order_code} invoice`,
      htmlBody: customerInvoiceHtml(order),
      body: plainInvoiceText(order)
    });

    markInvoiceSent(order.order_code);
    Logger.log(`Customer invoice sent for ${order.order_code}`);
  });
}

function ownerOrderHtml(order) {
  return `
    <h2>New website order ${escapeHtml(order.order_code)}</h2>
    <p><strong>Pickup:</strong> ${escapeHtml(formatDate(order.pickup_date))}</p>
    <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || "")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.customer_phone || "")}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customer_email || "Not provided")}</p>
    <p><strong>Payment:</strong> ${escapeHtml(paymentLabel(order.payment_method))}</p>
    ${order.notes ? `<p><strong>Questions/comments:</strong> ${escapeHtml(order.notes)}</p>` : ""}
    <p><strong>Method:</strong> ${escapeHtml(fulfillmentLabel(order.fulfillment_method))}</p>
    ${order.shipping_address ? `<p><strong>Shipping address:</strong> ${escapeHtml(order.shipping_address)}</p>` : ""}
    ${itemsHtml(order)}
    ${order.discount_cents ? `<p><strong>Coupon:</strong> ${escapeHtml(order.coupon_code || "")} (${escapeHtml(couponAppliesToLabel(order.coupon_applies_to))}) -${money(order.discount_cents)}</p>` : ""}
    <p><strong>Tax:</strong> ${money(order.tax_cents || 0)}</p>
    ${order.shipping_cents ? `<p><strong>Shipping:</strong> ${money(order.shipping_cents)}</p>` : ""}
    <p><strong>Total:</strong> ${money(order.total_cents)}</p>
    <p><a href="${WEBSITE_URL}/admin.html">Open admin orders</a></p>
  `;
}

function customerInvoiceHtml(order) {
  const invoiceUrl = invoiceLink(order);

  return `
    <h2>Thank you for your order!</h2>
    <p>Hi ${escapeHtml(order.customer_name || "there")},</p>
    <p>Your invoice for order <strong>${escapeHtml(order.order_code)}</strong> is ready.</p>
    <p>
      <a href="${invoiceUrl}" style="display:inline-block;padding:12px 18px;background:#2e6847;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
        View, save, or print invoice
      </a>
    </p>
    <p>If the button does not open, copy and paste this link:</p>
    <p><a href="${invoiceUrl}">${invoiceUrl}</a></p>
    <p><strong>Pickup:</strong> ${escapeHtml(formatDate(order.pickup_date))}, 4-7 pm</p>
    ${order.fulfillment_method === "shipping" ? `
      <p><strong>Shipping address:</strong> ${escapeHtml(order.shipping_address || "")}</p>
    ` : `<p>${escapeHtml(PICKUP_DETAILS)}</p>`}
    <p>Please call/text with any questions: ${escapeHtml(CONTACT_PHONE)}</p>
    <p>Thank you,<br />Jeni</p>
  `;
}

function itemsHtml(order) {
  const rows = (order.items || []).map(item => `
    <tr>
      <td>${escapeHtml(item.product_name || "")}</td>
      <td style="text-align:center;">${Number(item.quantity || 0)}</td>
      <td style="text-align:right;">${money(item.unit_price_cents)}</td>
      <td style="text-align:right;">${money(Number(item.quantity || 0) * Number(item.unit_price_cents || 0))}</td>
    </tr>
  `).join("");

  return `
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th align="left">Item</th>
          <th>Qty</th>
          <th align="right">Price</th>
          <th align="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function plainOrderText(order) {
  return [
    `New website order ${order.order_code}`,
    `Pickup: ${formatDate(order.pickup_date)}`,
    `Customer: ${order.customer_name || ""}`,
    `Phone: ${order.customer_phone || ""}`,
    `Email: ${order.customer_email || "Not provided"}`,
    `Payment: ${paymentLabel(order.payment_method)}`,
    `Method: ${fulfillmentLabel(order.fulfillment_method)}`,
    order.shipping_address ? `Shipping address: ${order.shipping_address}` : "",
    "",
    plainItemsText(order),
    "",
    order.discount_cents ? `Coupon ${order.coupon_code || ""} (${couponAppliesToLabel(order.coupon_applies_to)}): -${money(order.discount_cents)}` : "",
    `Tax: ${money(order.tax_cents || 0)}`,
    order.shipping_cents ? `Shipping: ${money(order.shipping_cents)}` : "",
    `Total: ${money(order.total_cents)}`,
    order.notes ? `Questions/comments: ${order.notes}` : ""
  ].join("\n");
}

function plainInvoiceText(order) {
  const invoiceUrl = invoiceLink(order);

  return [
    "Thank you for your order!",
    "",
    `Hi ${order.customer_name || "there"},`,
    `Your invoice for order ${order.order_code} is ready.`,
    `View, save, or print your invoice here: ${invoiceUrl}`,
    "",
    order.fulfillment_method === "shipping"
      ? `Ship date: ${formatDate(order.pickup_date)}`
      : `Pickup: ${formatDate(order.pickup_date)}, 4-7 pm`,
    order.fulfillment_method === "shipping"
      ? `Shipping address: ${order.shipping_address || ""}`
      : PICKUP_DETAILS,
    `Please call/text with any questions: ${CONTACT_PHONE}`,
    "",
    "Thank you,",
    "Jeni"
  ].join("\n");
}

function plainItemsText(order) {
  return (order.items || [])
    .map(item => {
      const quantity = Number(item.quantity || 0);
      return `${quantity} x ${item.product_name || ""} - ${money(quantity * Number(item.unit_price_cents || 0))}`;
    })
    .join("\n");
}

function ensureWebsiteSyncColumns(sheet) {
  const headers = [
    ["Website Order Code", "Payment Status", "Fulfillment Status", "Invoice Status", "Archived", "Last Website Sync"]
  ];

  sheet.getRange(1, 11, 1, headers[0].length).setValues(headers);
}

function existingWebsiteOrderRows(sheet) {
  const lastRow = lastFilledRow(sheet, 1);
  const rows = new Map();
  if (lastRow < 2) return rows;

  const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

  values.forEach((row, index) => {
    const code = String(row[10] || "").trim();
    if (!code) return;

    rows.set(code, {
      row: index + 2,
      orderId: row[0]
    });
  });

  return rows;
}

function nextNumericOrderId(sheet) {
  const lastRow = lastFilledRow(sheet, 1);
  if (lastRow < 2) return 1;

  const maxId = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .flat()
    .reduce((max, value) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);

  return maxId + 1;
}

function lastFilledRow(sheet, column) {
  const values = sheet.getRange(1, column, sheet.getMaxRows(), 1).getValues();

  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (String(values[index][0] || "").trim()) {
      return index + 1;
    }
  }

  return 1;
}

function productCostFormula(row) {
  return `=IF(OR($B${row}="",$C${row}=""),"",IFERROR(INDEX(FILTER('Price History'!$E$2:$E$501,('Price History'!$A$2:$A$501=$C${row})*('Price History'!$B$2:$B$501<=$B${row})*(('Price History'!$C$2:$C$501="")+('Price History'!$C$2:$C$501>=$B${row}))),1),""))`;
}

function localDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateString) {
  return localDate(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function invoiceLink(order) {
  return `${WEBSITE_URL}/invoice.html?order=${encodeURIComponent(order.order_code)}`;
}

function centsToDollars(cents) {
  return Number(cents || 0) / 100;
}

function money(cents) {
  return Utilities.formatString("$%.2f", Number(cents || 0) / 100);
}

function paymentLabel(value) {
  return {
    Venmo: "Venmo",
    Zelle: "Zelle",
    PayPal: "PayPal",
    CashApp: "CashApp",
    CashAtPickup: "Cash at Pickup"
  }[value] || value || "";
}

function statusLabel(value) {
  return String(value || "")
    .split("_")
    .map(word => word ? word[0].toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function fulfillmentLabel(value) {
  return value === "shipping" ? "Shipping" : "Pickup";
}

function invoiceStatusLabel(order) {
  if (!order.invoice_requested) return "Not requested";
  return order.invoice_sent ? "Requested and sent" : "Requested";
}

function couponAppliesToLabel(value) {
  return {
    items: "items",
    shipping: "shipping",
    order: "whole order"
  }[value] || "order";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
