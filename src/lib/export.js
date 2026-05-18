import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportToPDF(elementId, filename = "receipt.pdf") {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id ${elementId} not found`);
        return;
    }

    try {
        const canvas = await html2canvas(element, {
            backgroundColor: "#05050a", // Match app background
            scale: 2, // Higher quality
            logging: false,
            useCORS: true
        });

        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "px",
            format: [canvas.width / 2, canvas.height / 2]
        });

        pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
        pdf.save(filename);
        return true;
    } catch (err) {
        console.error("Failed to generate PDF:", err);
        throw err;
    }
}
