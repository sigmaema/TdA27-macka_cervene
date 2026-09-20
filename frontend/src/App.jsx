import { useState, useEffect } from "react";
import { getHealth, getTeam, getProducts, createProduct, updateProduct, deleteProduct } from "./api";
import ProductForm from "./ProductForm";
import ProductTable from "./ProductTable";

export default function App() {
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [team, setTeam] = useState(null);

  async function loadProducts() {
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (e) {
      console.error("Failed to load products:", e);
    }
  }

  useEffect(() => {
    loadProducts();
    getHealth()
      .then((data) => setHealthStatus(data.status))
      .catch((error) => console.error("Failed to load health status:", error));
    getTeam()
      .then(setTeam)
      .catch((error) => console.error("Failed to load team:", error));
  }, []);

  async function handleCreate(product) {
    await createProduct(product);
    loadProducts();
  }

  async function handleUpdate(id, product) {
    await updateProduct(id, product);
    setEditingProduct(null);
    loadProducts();
  }

  async function handleDelete(id) {
    await deleteProduct(id);
    loadProducts();
  }

  return (
    <div>
      <h1>Think different Academy</h1>
      {healthStatus === "ok" && <p>Status: OK</p>}
      {team && (
        <footer>
          Tým: {team.name} | Členové: {team.members.join(", ")}
        </footer>
      )}

      <ProductForm
        onSubmit={editingProduct ? (p) => handleUpdate(editingProduct.id, p) : handleCreate}
        initial={editingProduct}
        onCancel={editingProduct ? () => setEditingProduct(null) : null}
      />

      <ProductTable
        products={products}
        onEdit={setEditingProduct}
        onDelete={handleDelete}
      />
    </div>
  );
}
