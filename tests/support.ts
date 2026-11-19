import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { USERS } from "./helpers";

export const SHIPPING = { name: "Ana Garcia", address: "1234 Corrientes Ave" };
export const CARD = { number: "4242424242424242" };

/** Logs in through the documented API; the session cookie stays in the request context. */
export async function apiLogin(request: APIRequestContext, user = USERS.ana) {
  const res = await request.post("/api/login", { data: user });
  expect(res.ok()).toBeTruthy();
}

/** POST /api/checkout with valid shipping and card unless overridden. */
export function checkout(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/checkout", { data: { shipping: SHIPPING, card: CARD, ...body } });
}

export async function stockOf(request: APIRequestContext, productId: number): Promise<number> {
  const res = await request.get(`/api/products/${productId}`);
  return (await res.json()).stock;
}

/** Opens the product detail page, picks a quantity and adds it to the cart. */
export async function addFromDetail(page: Page, productId: number, quantity = 1) {
  await page.goto(`/product/${productId}`);
  await page.getByTestId("quantity-select").selectOption(String(quantity));
  await page.getByTestId("add-to-cart").click();
}

export async function fillCheckout(page: Page, name = SHIPPING.name, address = SHIPPING.address, card = CARD.number) {
  await page.getByTestId("shipping-name").fill(name);
  await page.getByTestId("shipping-address").fill(address);
  await page.getByTestId("card-number").fill(card);
}

/** Seeds the browser cart (localStorage) only on the first page load of the test. */
export async function seedCart(page: Page, rawValue: string) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem("shopnow.cart")) localStorage.setItem("shopnow.cart", value);
  }, rawValue);
}
