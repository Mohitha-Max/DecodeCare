const LabCharts = ({ values }) => {
  const data = [
    { name: "HGB", value: Number(values.hemoglobin), key: 'hemoglobin' },
    { name: "FBS", value: Number(values.fbs), key: 'fbs' },
    { name: "A1c", value: Number(values.hba1c), key: 'hba1c' },
    { name: "CHL", value: Number(values.cholesterol), key: 'cholesterol' },
    { name: "CRT", value: Number(values.creatinine), key: 'creatinine' },
    { name: "SYS", value: Number(values.systolic), key: 'systolic' },
    { name: "DIA", value: Number(values.diastolic), key: 'diastolic' },
  ].filter(item => item.value > 0);

  const getBarColor = (name, value) => {
    if (name === "FBS" && value > 99) return "#ef4444";
    if (name === "A1c" && value > 5.6) return "#ef4444";
    if (name === "CHL" && value > 200) return "#ef4444";
    if (name === "CRT" && value > 1.2) return "#ef4444";
    if (name === "SYS" && value > 120) return "#ef4444";
    if (name === "DIA" && value > 80) return "#ef4444";
    return "#1e88e5";
  };

  const maxValue = Math.max(...data.map(item => item.value), 1);

  return (
    <div style={{ width: "100%", height: 250, overflowX: "auto" }}>
      <h3 style={{ fontSize: 12, color: "#0f4c75", textTransform: "uppercase" }}>📊 Value Comparison</h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 190, minWidth: data.length * 42, padding: "10px 4px", borderBottom: "1px solid #dbe5ed" }}>
        {data.map((item) => (
          <div key={item.key} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "#475569" }}>{item.value}</span>
            <div
              title={`${item.name}: ${item.value}`}
              style={{
                width: "70%",
                maxWidth: 34,
                height: `${Math.max((item.value / maxValue) * 150, 4)}px`,
                background: getBarColor(item.name, item.value),
                borderRadius: "4px 4px 0 0",
              }}
            />
            <span style={{ fontSize: 9, color: "#64748b" }}>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LabCharts;