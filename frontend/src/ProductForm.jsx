export default function ProductForm({ onSubmit, initial, onCancel }) {
  function handleSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name");
    const cost = Number(formData.get("cost"));

    if (!name || !cost) return;

    onSubmit({ name, cost });
    if (!initial) {
      e.currentTarget.reset();
    }
  }

  return (
    <form className="product-form" key={initial?.id || "new"} onSubmit={handleSubmit}>
      <label className="field">
        Name
        <input name="name" defaultValue={initial?.name || ""} required />
      </label>
      <label className="field">
        Price
        <input name="cost" type="number" defaultValue={initial?.cost || ""} required />
      </label>
      <button className="button button-primary" type="submit">{initial ? "Save changes" : "Add product"}</button>
      {onCancel && <button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}
