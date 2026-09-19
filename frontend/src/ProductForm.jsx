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
    <form key={initial?.id || "new"} onSubmit={handleSubmit}>
      <label>
        Name
        <input name="name" defaultValue={initial?.name || ""} required />
      </label>
      <label>
        Price
        <input name="cost" type="number" defaultValue={initial?.cost || ""} required />
      </label>
      <button type="submit">{initial ? "Save" : "Add"}</button>
      {onCancel && <button type="button" onClick={onCancel}>Zrušit</button>}
    </form>
  );
}
