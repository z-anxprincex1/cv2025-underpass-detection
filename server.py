import os
import cv2
import numpy as np
import base64
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import uvicorn

app = FastAPI(title="Underpass Detection OBB API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained YOLOv8-OBB model
MODEL_PATH = os.path.join("runs", "obb", "rot15_augmented10", "weights", "best.pt")
if not os.path.exists(MODEL_PATH):
    # Fallback to look up model files if path changes
    raise FileNotFoundError(f"Model weights not found at {MODEL_PATH}")

print(f"Loading YOLOv8-OBB model from {MODEL_PATH}...")
model = YOLO(MODEL_PATH)
print("Model loaded successfully. Class names:", model.names)

@app.get("/api/status")
def status():
    return {
        "status": "healthy",
        "model": "YOLOv8n-OBB",
        "classes": model.names,
        "device": str(model.device)
    }

@app.post("/api/detect")
async def detect(
    file: UploadFile = File(...),
    conf: float = Form(0.25),
    iou: float = Form(0.5)
):
    # Validate file extension
    extension = file.filename.split(".")[-1].lower()
    if extension not in ["jpg", "jpeg", "png", "webp"]:
        raise HTTPException(status_code=400, detail="Unsupported image format. Use JPG, PNG, or WEBP.")

    try:
        # Read image bytes
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")

        # Run inference
        results = model(img, conf=conf, iou=iou, verbose=False)
        result = results[0]

        # Extract OBB (Oriented Bounding Box) predictions
        detections = []
        obb = result.obb
        if obb is not None:
            # xyxyxyxy contains coordinates of 4 corners (N, 4, 2)
            xyxyxyxy = obb.xyxyxyxy.cpu().numpy().tolist() if len(obb.xyxyxyxy) > 0 else []
            confidences = obb.conf.cpu().numpy().tolist() if len(obb.conf) > 0 else []
            classes = obb.cls.cpu().numpy().tolist() if len(obb.cls) > 0 else []
            
            for i in range(len(classes)):
                detections.append({
                    "class_id": int(classes[i]),
                    "label": model.names[int(classes[i])],
                    "confidence": float(confidences[i]),
                    "corners": xyxyxyxy[i]
                })

        # Generate annotated image
        annotated_img = result.plot()
        
        # Encode annotated image as base64 string
        _, encoded_img = cv2.imencode(".jpg", annotated_img)
        base64_img = base64.b64encode(encoded_img).decode("utf-8")
        base64_uri = f"data:image/jpeg;base64,{base64_img}"

        # Calculate image dimensions
        h, w, _ = img.shape

        return {
            "width": w,
            "height": h,
            "detections": detections,
            "annotated_image": base64_uri,
            "inference_speed_ms": result.speed
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8008, reload=True)
