const envApiUrl = import.meta.env.VITE_API_URL;
const API_URL = (envApiUrl && envApiUrl.trim()) ? envApiUrl : (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");

export async function getHealth() {
  const res = await fetch(`${API_URL}/v1/health`);
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return res.json();
}

export async function getTeam() {
  const res = await fetch(`${API_URL}/v1/team`);
  if (!res.ok) throw new Error(`Team request failed with status ${res.status}`);
  return res.json();
}

export async function getProducts() {
  const res = await fetch(`${API_URL}/product`);
  return res.json();
}

export async function createProduct(product) {
  const res = await fetch(`${API_URL}/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  });
  return res.json();
}

export async function updateProduct(id, product) {
  const res = await fetch(`${API_URL}/product/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  });
  if (res.status === 404) {
    const err = await res.json();
    throw new Error(err.message);
  }
  return res.json();
}

export async function deleteProduct(id) {
  const res = await fetch(`${API_URL}/product/${id}`, {
    method: "DELETE",
  });
  return res.json();
}
