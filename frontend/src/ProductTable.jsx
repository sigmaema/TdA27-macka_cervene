export default function ProductTable({ products, onEdit, onDelete }) {
  if (products.length === 0) {
    return <div className="empty-state"><strong>No products yet</strong><span>Add the first item to your catalogue above.</span></div>;
  }

  return (
    <div className="table-wrap"><table>
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
            <td className="price">{p.cost} Kč</td>
            <td className="actions">
              <button className="table-action" onClick={() => onEdit(p)}>Edit</button>
              <button className="table-action table-action-danger" onClick={() => onDelete(p.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
