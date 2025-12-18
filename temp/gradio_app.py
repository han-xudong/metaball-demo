#!/usr/bin/env python

"""
BallNet Demo App
"""

import os
import numpy as np
import trimesh
import pandas as pd
import tempfile
import gradio as gr
import matplotlib as mpl
from huggingface_hub import hf_hub_download
import onnxruntime as ort

model_dict = {
    "BallNet": "asRobotics/ballnet",
}

vertices_dict = {}
faces_dict = {}
def_index_dict = {}
for name in model_dict.keys():
    vertices_dict[name] = np.loadtxt(
        f"assets/{name.lower().replace('net', '')}/surface_coordinate.txt", delimiter=","
    )
    faces_dict[name] = (
        np.loadtxt(
            f"assets/{name.lower().replace('net', '')}/surface_triangle.txt",
            delimiter=",",
            dtype=int,
        )
        - 1
    )
    def_index_dict[name] = np.loadtxt(
        f"assets/{name.lower().replace('net', '')}/deform_node.txt", dtype=int
    )
colormap = mpl.colormaps.get_cmap("viridis")
cmin = 0.0
cmax = 12.0

def load_model(model_name="ballnet"):
    repo_id = f"asRobotics/{model_name}"
    model_filename = "model.onnx"
    model_path = hf_hub_download(repo_id=repo_id, filename=model_filename)
    return ort.InferenceSession(model_path)

ort_dict = {}
for name, path in model_dict.items():
    try:
        ort_dict[name] = load_model(name)
    except Exception as e:
        print(f"Warning: Could not load model '{name}' from '{path}'. Error: {e}")


def make_double_sided(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    faces_front = mesh.faces.copy()
    vertices = mesh.vertices.copy()
    faces_back = np.fliplr(faces_front) + len(vertices)
    vertices_double = np.vstack([vertices, vertices])
    faces_double = np.vstack([faces_front, faces_back])

    if hasattr(mesh.visual, "vertex_colors") and mesh.visual.vertex_colors is not None:
        colors = mesh.visual.vertex_colors.copy()
        colors_double = np.vstack([colors, colors])
    else:
        colors_double = None

    mesh_double = trimesh.Trimesh(
        vertices=vertices_double,
        faces=faces_double,
        vertex_colors=colors_double,
        process=False,
    )

    return mesh_double


def predict_from_motion(dx, dy, dz, rx, ry, rz, model_name):
    motion = np.array(
        [dx, dy, dz, rx / 180.0 * np.pi, ry / 180.0 * np.pi, rz / 180.0 * np.pi],
        dtype=np.float32,
    ).reshape(1, -1)
    assert motion.shape[1] == 6, "Motion must be 6D (x,y,z,rx,ry,rz)"

    outputs = ort_dict[model_name].run(None, {"motion": motion})
    force = np.array(outputs[0]).flatten()
    nodes = np.array(outputs[1]).reshape(-1, 3)

    df = pd.DataFrame(
        force.reshape(1, -1),
        columns=["Fx (N)", "Fy (N)", "Fz (N)", "Tx (Nmm)", "Ty (Nmm)", "Tz (Nmm)"],
    )
    df = df.style.format("{:.3f}")

    delta_vertices = np.zeros_like(vertices_dict[model_name])
    delta_vertices[def_index_dict[model_name] - 1] += nodes.reshape(-1, 3)
    new_vertices = vertices_dict[model_name] + delta_vertices

    rot_x_neg90 = np.array(
        [
            [1, 0, 0],
            [0, 0, 1],
            [0, -1, 0],
        ]
    )
    new_vertices = new_vertices @ rot_x_neg90.T

    norm_dist = np.clip(np.linalg.norm(delta_vertices, axis=1), cmin, cmax)
    colors = (colormap((norm_dist - cmin) / (cmax - cmin)) * 255).astype(np.uint8)

    mesh = trimesh.Trimesh(
        vertices=new_vertices,
        faces=faces_dict[model_name],
        vertex_colors=colors,
        process=False,
    )
    mesh = make_double_sided(mesh)

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".glb")
    mesh.export(tmp_file.name, file_type="glb")

    return df, tmp_file.name


with gr.Blocks(title="BallNet Demo") as demo:
    gr.Markdown("# 🖐️ BallNet Demo\n\n")

    with gr.Row():
        with gr.Column():
            gr.Markdown("## Model")
            model = gr.Dropdown(
                choices=list(model_dict.keys()),
                value=list(model_dict.keys())[0],
                label="Select Model",
                show_label=False,
                interactive=False,
            )

            gr.Markdown("## Motion Inputs")
            gr.Markdown("### Translation (mm)")
            dx = gr.Slider(-10, 10, 0, step=0.1, label="Dx")
            dy = gr.Slider(-10, 10, 0, step=0.1, label="Dy")
            dz = gr.Slider(-3, 3, 0, step=0.1, label="Dz")
            gr.Markdown("### Rotation (degrees)")
            rx = gr.Slider(-30, 30, 0, step=0.5, label="Rx")
            ry = gr.Slider(-30, 30, 0, step=0.5, label="Ry")
            rz = gr.Slider(-30, 30, 0, step=0.5, label="Rz")

        with gr.Column():
            gr.Markdown("## Force Outputs")
            output_force = gr.DataFrame(
                headers=[
                    "Fx (N)",
                    "Fy (N)",
                    "Fz (N)",
                    "Tx (Nmm)",
                    "Ty (Nmm)",
                    "Tz (Nmm)",
                ],
                label="Predicted Force",
                show_label=False,
                datatype=["number"] * 6,
                row_count=(1, "fixed"),
                interactive=False,
                column_widths=["16%"] * 6,
            )

            gr.Markdown("## Mesh Outputs")
            height = 500
            output_mesh = gr.Model3D(
                label="Mesh",
                show_label=False,
                height=height,
                camera_position=[45, 60, 150],
            )

    inputs = [dx, dy, dz, rx, ry, rz, model]
    for inp in inputs:
        inp.change(
            fn=predict_from_motion, inputs=inputs, outputs=[output_force, output_mesh]
        )

    demo.load(
        fn=predict_from_motion, inputs=inputs, outputs=[output_force, output_mesh]
    )

demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))