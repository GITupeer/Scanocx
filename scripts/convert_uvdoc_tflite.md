# Konwersja UVDoc → TFLite

Źródło: [fredcallagan/uvdoc-grid-onnx](https://huggingface.co/fredcallagan/uvdoc-grid-onnx)

## Wymagania

- Docker **lub** Python 3.10+ z `onnx2tf`, `onnx`, `tensorflow`

## Docker (zalecane)

Z katalogu głównego repo:

```bash
# 1. Pobierz ONNX (+ zewnętrzne wagi .data)
mkdir -p scripts/.uvdoc_convert assets/models
curl -L -o scripts/.uvdoc_convert/UVDoc_grid.onnx \
  "https://huggingface.co/fredcallagan/uvdoc-grid-onnx/resolve/main/UVDoc_grid.onnx"
curl -L -o scripts/.uvdoc_convert/UVDoc_grid.onnx.data \
  "https://huggingface.co/fredcallagan/uvdoc-grid-onnx/resolve/main/UVDoc_grid.onnx.data"

# 2. Konwersja (obraz z onnx2tf)
docker run --rm -v "%CD%/scripts/.uvdoc_convert:/work" -w /work \
  pinto0309/onnx2tf:latest \
  onnx2tf -i UVDoc_grid.onnx -o /work/out -oh5

# 3. Skopiuj wynik
copy scripts\.uvdoc_convert\out\*_float32.tflite assets\models\uvdoc_grid.tflite
```

Na Linux/macOS zamień `copy` na `cp` i `%CD%` na `$(pwd)`.

## Lokalny Python

```bash
pip install onnx2tf onnx tensorflow
onnx2tf -i scripts/.uvdoc_convert/UVDoc_grid.onnx -o scripts/.uvdoc_convert/out
cp scripts/.uvdoc_convert/out/*_float32.tflite assets/models/uvdoc_grid.tflite
```

## Specyfikacja modelu

| Pole | ONNX (HF) | TFLite (po onnx2tf) |
|------|-----------|---------------------|
| Input | `(1, 3, 720, 496)` NCHW | `(1, 720, 496, 3)` NHWC float32 `[0, 1]` |
| Output | `(1, 2, 45, 31)` NCHW | `(1, 45, 31, 2)` HWC, współrzędne `[-1, 1]` |
| Rozmiar | ~30 MB | używaj `*_float32.tflite` (float16 pada na CONV_2D bez Flex) |

Asset aplikacji: `assets/models/uvdoc_grid.tflite`.
