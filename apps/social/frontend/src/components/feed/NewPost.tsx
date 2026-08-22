import { api, getCurrentDate } from "@/lib";
import { useState, useRef, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { IoCloseCircleSharp } from "react-icons/io5";
import { MdOutlinePhotoCamera, MdOutlineViewCarousel } from "react-icons/md";
import { toast } from "react-toastify";
import { CameraCapture } from "@/components/media/CameraCapture";

const MAX_CAROUSEL_ITEMS = 10;

interface SelectedMedia {
  id: string;
  file: File;
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

export function NewPost({ setIsLoading, getRecentPosts }) {
  const [inputIsOpen, setInputIsOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const inputMediaRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<SelectedMedia | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function handlerNewPost() {
    if (postContent.length === 0 && selectedMedia.length === 0) {
      return;
    }

    const payload = [...selectedMedia];
    const content = postContent;
    setPostContent("");
    setSelectedMedia([]);
    setIsLoading(true);

    const dataForm = new FormData();

    for (const item of payload) {
      dataForm.append("picture", item.file);
    }

    dataForm.append("body", JSON.stringify({
      createdOn: getCurrentDate(),
      postContent: content
    }));

    try {
      const { data } = await api().put("/posts/create",
        dataForm, {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        });

      if (data.success) {
        getRecentPosts(true);
        setInputIsOpen(false);
      } else {
        setPostContent(content);
        setSelectedMedia(payload);
        toast.error(data?.message || "Erro ao criar post");
      }
    } catch {
      setPostContent(content);
      setSelectedMedia(payload);
      toast.error("Erro ao criar post");
    } finally {
      setIsLoading(false);
    }
  }

  function appendFiles(files: File[]) {
    const remaining = MAX_CAROUSEL_ITEMS - selectedMedia.length;
    if (remaining <= 0) {
      toast.warning("O carrossel aceita no máximo 10 fotos ou vídeos.");
      return;
    }

    if (files.length > remaining) {
      toast.warning("O carrossel aceita no máximo 10 fotos ou vídeos.");
    }

    setSelectedMedia([
      ...selectedMedia,
      ...files.slice(0, remaining).map(file => ({ id: uuid(), file }))
    ]);
  }

  function addMedia() {
    const files = Array.from(inputMediaRef.current?.files || []);
    if (inputMediaRef.current) {
      inputMediaRef.current.value = "";
    }
    appendFiles(files);
  }

  function openCamera() {
    if (selectedMedia.length >= MAX_CAROUSEL_ITEMS) {
      toast.warning("O carrossel aceita no máximo 10 fotos ou vídeos.");
      return;
    }
    setCameraOpen(true);
  }

  function deletePreview(id: string) {
    setSelectedMedia(selectedMedia.filter(item => item.id !== id));
    if (previewFile?.id === id) {
      setPreviewFile(null);
    }
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = previewFile ? "hidden" : "auto";
    }
  }, [previewFile]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-3 text-lg font-medium text-ink">Criar uma nova postagem</h2>

      <hr className="mb-4 border-slate-100" />

      {
        inputIsOpen
        ? <textarea
          placeholder={"Coloque aqui seu texto :)"}
          value={postContent}
          onChange={(e) => setPostContent(e.target.value)}
          onBlur={ ({ target }) => target.value.length === 0 ? setInputIsOpen(false) : "" }
          autoFocus={true}
          className="form-textarea"
        />
        : <input
          onFocus={() => setInputIsOpen(true)}
          type={"text"}
          placeholder={"Escreva algo ou publique fotos e vídeos..."}
          className="form-input"
        />
      }

      { selectedMedia.length > 0 ? <hr /> : null }

      { selectedMedia.length > 1 ? (
        <p className="mt-3 text-xs font-medium text-slate-500">
          Carrossel · {selectedMedia.length} itens
        </p>
      ) : null }

      <div className="mt-3 flex flex-wrap gap-2">

        {
          selectedMedia.map(item =>
            <div
              className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-black p-1 sm:h-32 sm:w-32"
              key={item.id}
            >
              <div
                className="absolute inset-0 z-[1] h-full w-full"
                onClick={() => setPreviewFile(item)}
              ></div>

              <IoCloseCircleSharp
                className="absolute right-1 top-1 z-10 text-xl text-white drop-shadow"
                onClick={() => deletePreview(item.id)}
              />

              { isVideoFile(item.file) ? (
                <>
                  <video
                    src={URL.createObjectURL(item.file)}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                  <span className="absolute bottom-1 left-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Vídeo
                  </span>
                </>
              ) : (
                <img
                  src={URL.createObjectURL(item.file)}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          )
        }
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center">
          <label
            htmlFor="newmedia"
            title="Adicionar fotos e vídeos ao carrossel"
            className="mr-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-mist text-xl text-ink"
          >
            <input
              id="newmedia"
              type={"file"}
              multiple
              ref={inputMediaRef}
              onChange={addMedia}
              accept={"image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"}
              className="hidden"
            />

            <MdOutlineViewCarousel />
          </label>

          <button
            type="button"
            title="Abrir câmera"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-mist text-xl text-ink"
            onClick={openCamera}
          >
            <MdOutlinePhotoCamera />
          </button>
        </div>

        <button
          className="rounded-xl border-0 bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={postContent.length === 0 && selectedMedia.length === 0}
          onClick={handlerNewPost}
        >Publicar</button>
      </div>

      <CameraCapture
        open={cameraOpen}
        title="Câmera do post"
        hint="A foto ou o vídeo entra no carrossel"
        onClose={() => setCameraOpen(false)}
        onCapture={file => {
          appendFiles([file]);
          setCameraOpen(false);
        }}
      />

      {
        previewFile !== null
        ?
          <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col items-center justify-center">
            <div className="absolute inset-0 h-full w-full bg-black/60" onClick={() => setPreviewFile(null)}>
            </div>

            <div className="relative z-10 flex h-[92vh] w-[95vw] flex-col items-center justify-between rounded-2xl bg-white p-4">
              <div className="absolute right-4 top-4 z-20 cursor-pointer text-2xl" onClick={() => setPreviewFile(null)}>
                <IoCloseCircleSharp />
              </div>

              <div className="flex h-[80%] w-full items-center justify-center">
                { isVideoFile(previewFile.file) ? (
                  <video
                    src={URL.createObjectURL(previewFile.file)}
                    className="max-h-full max-w-full"
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    alt={"preview"}
                    src={URL.createObjectURL(previewFile.file)}
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </div>

              <div className="flex max-w-full flex-row-reverse flex-wrap justify-center gap-2 rounded-xl bg-mist p-2">
                {
                  selectedMedia.map((item) =>
                    <div
                      className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden border border-slate-300 bg-black sm:h-20 sm:w-20"
                      onClick={() => setPreviewFile(item)}
                      key={item.id}
                      style={
                        previewFile.id === item.id
                        ? { transform: "scale(0.8)", border: "solid 1px var(--default-blue)" }
                        : {}
                      }
                    >
                      { isVideoFile(item.file) ? (
                        <video src={URL.createObjectURL(item.file)} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <img src={URL.createObjectURL(item.file)} alt={"select option to view"} className="h-full w-full object-cover" />
                      )}
                    </div>
                  )
                }
              </div>

            </div>
          </div>
        : <></>
      }

    </div>
  );
}
