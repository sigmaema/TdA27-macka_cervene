export default function ProductTable({ products, onEdit, onDelete }) {
  if (products.length === 0) {
    return <p>No products.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Price</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p.id}>
            <td>{p.id}</td>
            <td>{p.name}</td>
            <td>{p.cost}</td>
            <td className="actions">
              <button onClick={() => onEdit(p)}>Edit</button>
              <button onClick={() => onDelete(p.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
