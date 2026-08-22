import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib";
import { Comments } from "./Comments";
import { AiOutlineComment, AiOutlineDislike, AiOutlineLike, AiFillLike, AiFillDislike } from "react-icons/ai";
import Link from "@/lib/legacy-link";
import { MdOutlineArrowBackIos, MdOutlineArrowForwardIos } from "react-icons/md";
import { BiDotsHorizontal } from "react-icons/bi";
import { BsTrash } from "react-icons/bs";
import { IoClose } from "react-icons/io5";
import { MdOutlinedFlag } from "react-icons/md";
import { toast } from "react-toastify";

import { ActionModal } from "./ActionModal";
import { PostBody, LikeOrDislike } from "@/types";
import { parsePostMedia, PostMediaItem } from "@/lib/postMedia";

function renderPostContent(content: string) {
  const parts = content.split(/(#[\p{L}0-9_]{2,40}|@[A-Za-z0-9._-]{2,40})/gu);
  return parts.map((part, index) => {
    if (part.startsWith("#")) {
      return (
        <Link key={index} href={`/search/${encodeURIComponent(part)}`}>
          <a className="text-brand">{part}</a>
        </Link>
      );
    }
    if (part.startsWith("@")) {
      return (
        <Link key={index} href={`/search/${encodeURIComponent(part.slice(1))}`}>
          <a className="text-brand">{part}</a>
        </Link>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

interface PostProps {
  data: PostBody;
  currentUserId: string;
}

export function Post({ data: postInfo, currentUserId }: PostProps) {
  const [showComments, setShowComments] = useState(false);
  const [previewImage, setPreviewImage] = useState<PostMediaItem | null>(null);
  const [allImages, setAllImages] = useState<PostMediaItem[]>([]);
  const [currentCarouselImage, setCurrentCarouselImage] = useState(0);
  const [dropdownIsOpen, setDropdownIsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [postIsDeleted, setPostIsDeleted] = useState<number>(0);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isLoading, setIsloading] = useState({
    like: false,
    dislike: false
  });
  const [isActionType, setIsActionType] = useState({
    like: false,
    dislike: false
  });

  const [likes, setLikes] = useState<LikeOrDislike[]>([]);
  const [dislikes, setDislikes] = useState<LikeOrDislike[]>([]);

  const postWidthRef = useRef(null);
  const previewActions = organizeActionsPreview();
  const [modalIsOpen, setModalIsOpen] = useState(false);


  useEffect(() => { // preload post wimages
    renderPreloadImages();
    getActions();
  }, []);

  useEffect(() => {
    verifyUserAction();
  }, [likes, dislikes]);

  useEffect(() => { // Disable overflow to page body
    if (previewImage) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [previewImage]);

  
  function organizeActionsPreview() {
    let arr: LikeOrDislike[] = [];

    if (likes.length > dislikes.length) {
      for (let c = 0; c < likes.length && arr.length < 4; c++) {
        arr.push({ ...likes[c], like: true });
  
        for (let i = c; c < dislikes.length && arr.length < 4; i++) {
          arr.push({ ...dislikes[i], dislike: true });
          break;
        }
      }
    } else {
      for (let c = 0; c < dislikes.length && arr.length < 4; c++) {
        arr.push({ ...dislikes[c], dislike: true });
  
        for (let i = c; i < likes.length && arr.length < 4; i++) {
          arr.push({ ...likes[i], like: true });
          break;
        }
      }
    }

    return arr;
  }


  function verifyUserAction() {
    let type = 0;

    for (let c = 0; c < likes.length; c++) {
      if (likes[c].user_id == currentUserId) {
        type = 1;
        break;
      }
    }

    for (let c = 0; c < dislikes.length; c++) {
      if (dislikes[c].user_id == currentUserId) {
        type = 2;
        break;
      }
    }

    return setIsActionType({ like: type == 1, dislike: type == 2 });
  }

  async function getActions() {
    setIsloading({ like: true, dislike: true });
    try {
      const { data } = await api().post("/posts/actions", { postID: postInfo.id });
      if (data?.success) {
        setLikes([ ...data.likes ]);
        setDislikes([ ...data.dislikes ]);
      }
    } finally {
      setIsloading({ like: false, dislike: false });
    }
  }

  function renderPreloadImages() {
    setAllImages(parsePostMedia(postInfo.images, process.env.NEXT_PUBLIC_CLOUDINARY_API_URL));
  }

  function nextCarousel() {
    if (currentCarouselImage < allImages.length-1) {
      setCurrentCarouselImage(currentCarouselImage+1);
    }
  }

  function backCarousel() {
    if (currentCarouselImage > 0) {
      setCurrentCarouselImage(currentCarouselImage-1);
    }
  }

  function onClickOutsideDropdown(element, event) {
    if (deleteLoading)
      return event.preventDefault();
    
    let classes = element.classList

    for (let c = 0; c < classes.length; c++) {
      if (classes[c].toLocaleLowerCase().indexOf("option") == -1)
        setDropdownIsOpen(false);
        setReportOpen(false);
    }
  }

  async function deletePost() {
    setDeleteLoading(true);
    const { data } = await api().delete(`/posts/${postInfo.id}`)
    setDeleteLoading(false);

    if (data.success) {
      setPostIsDeleted(1);
      setTimeout(() => {
        setPostIsDeleted(2);
      }, 3000)
    } else {
      toast.error("Erro ao deletar post");
    }
  }

  async function reportPost() {
    if (reportReason.trim().length < 3) {
      toast.warning("Descreva o motivo com pelo menos 3 caracteres.");
      return;
    }

    setReportLoading(true);
    try {
      const { data } = await api().post("/user/report", {
        targetType: "post",
        postId: postInfo.id,
        reason: reportReason.trim()
      });
      toast.success(data?.message || "Denúncia registrada.");
      setDropdownIsOpen(false);
      setReportOpen(false);
      setReportReason("");
    } catch {
      toast.warning("Não foi possível denunciar.");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleNewLike() {
    if (!isLoading.like && !isLoading.dislike) {
      if (isActionType.like) { // remove live
        setIsloading({ ...isLoading, like: true });
        await api().delete(`/posts/${postInfo.id}/like`);
        setIsloading({ ...isLoading, like: false });

      } else { // new like
        setIsloading({ ...isLoading, like: true });
        await api().put(`/posts/${postInfo.id}/like`);
        setIsloading({ ...isLoading, like: false });

      }
      getActions();
    }
  }

  async function handleNewDislike() {
    if (!isLoading.dislike && !isLoading.like) {
      if (isActionType.dislike) { // remove dislike
        setIsloading({ ...isLoading, dislike: true });
        await api().delete(`/posts/${postInfo.id}/dislike`);
        setIsloading({ ...isLoading, dislike: false });

      } else { // new dislike
        setIsloading({ ...isLoading, dislike: true });
        await api().put(`/posts/${postInfo.id}/dislike`);
        setIsloading({ ...isLoading, dislike: false });

      }
      getActions();
    }
  }


  if (postIsDeleted === 0)
    return (
      <div 
        style={deleteLoading ? { opacity: "0.5", userSelect: "none" } : null}
        className="mt-8 rounded-2xl bg-white p-4 shadow-sm sm:p-6" 
        onClick={(e) => onClickOutsideDropdown(e.target, e)}
      >

        <ActionModal
          modalIsOpen={modalIsOpen}
          setModalIsOpen={setModalIsOpen}
          postId={postInfo.id}
        />

        {
          previewImage
          ?
            <div className="fixed inset-0 z-[99] flex h-screen w-screen items-center justify-center bg-black/95" onClick={() => setPreviewImage(null)}>
              {previewImage.kind === "video" ? (
                <video
                  src={previewImage.url}
                  className="max-h-[92vh] max-w-[95vw]"
                  controls
                  autoPlay
                  playsInline
                  onClick={event => event.stopPropagation()}
                />
              ) : (
                <img src={previewImage.url} className="max-h-[92vh] max-w-[95vw] object-contain" />
              )}
              <IoClose className="absolute right-4 top-4 cursor-pointer text-3xl text-white" />
            </div>
          : <></>
        }
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/profile/${postInfo.fk_user_id}`}>
              <a className="flex items-center">
                <div className="mr-3 h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <img
                    alt={"user profile"}
                    src={postInfo.image_url}
                  />
                </div>

                <div className="truncate text-sm font-medium text-ink">
                  {postInfo.username}
                </div>
              </a>
            </Link>
          </div>

          {
            postInfo.fk_user_id === currentUserId
            ? <div 
                className="relative cursor-pointer text-xl text-slate-500"
                onClick={() => setDropdownIsOpen(dropdownIsOpen == false)}
              >
              <BiDotsHorizontal />

              {
                dropdownIsOpen 
                ? ( 
                  <div className="absolute right-0 z-10 rounded-xl bg-white p-1 shadow-soft">
                    <div className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={deletePost}>
                      <BsTrash />
                      Deletar
                    </div>
                  </div>
                ) : <></>
              }
            </div>
            : <div
                className="relative cursor-pointer text-xl text-slate-500"
                onClick={() => setDropdownIsOpen(dropdownIsOpen == false)}
              >
              <BiDotsHorizontal />
              {dropdownIsOpen ? (
                <div className="absolute right-0 z-10 w-56 rounded-xl bg-white p-1 shadow-soft" onClick={event => event.stopPropagation()}>
                  {reportOpen ? (
                    <div className="space-y-2 p-2">
                      <p className="text-xs font-medium text-ink">Motivo da denúncia</p>
                      <textarea
                        className="form-input min-h-[4.5rem] text-sm"
                        placeholder="Descreva o que está errado neste post"
                        value={reportReason}
                        onChange={({ target }) => setReportReason(target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border-0 bg-slate-100 px-3 py-1.5 text-xs"
                          onClick={() => setReportOpen(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border-0 bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          disabled={reportLoading}
                          onClick={reportPost}
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
                      onClick={() => setReportOpen(true)}
                    >
                      <MdOutlinedFlag />
                      Denunciar
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          }
        </header>

        <hr className="border-slate-100" />

        <section className="w-full" ref={postWidthRef}>
          { 
            postInfo.content.length > 0  
            ? <div className="break-words border-l-2 border-slate-300 px-4 py-4">{renderPostContent(postInfo.content)}</div>
            : <></>
          }

          <div className="flex items-center justify-center">
            {
              allImages.length > 0
              ? (
                  <div className="relative mt-4 flex w-full max-w-full items-center justify-center">
                    {
                      allImages.length > 1 && currentCarouselImage < allImages.length-1
                      ? <div
                        className="absolute right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow-lg"
                        onClick={nextCarousel}
                      >
                        <MdOutlineArrowForwardIos /></div>
                      : <></>
                    }

                    {
                      allImages.length > 1 && currentCarouselImage > 0
                      ?
                        <div
                          className="absolute left-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow-lg"
                          onClick={backCarousel}
                        ><MdOutlineArrowBackIos /></div>
                      : <></>
                    }

                    { allImages.length > 1 ? (
                      <span className="absolute right-3 top-3 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                        {currentCarouselImage + 1}/{allImages.length}
                      </span>
                    ) : null }

                    {allImages[currentCarouselImage]?.kind === "video" ? (
                      <video
                        key={allImages[currentCarouselImage].url}
                        src={allImages[currentCarouselImage].url}
                        className="max-h-[70vh] w-full rounded-xl bg-black object-contain"
                        controls
                        playsInline
                      />
                    ) : (
                      <img
                        src={allImages[currentCarouselImage]?.url}
                        className="max-h-[70vh] w-full cursor-pointer rounded-xl object-contain"
                        onClick={() => setPreviewImage(allImages[currentCarouselImage])}
                      />
                    )}

                  </div>
                )
              : <></>
            }
          </div>
          <div className="my-4 flex w-full items-center justify-center">
            {
              allImages.length > 1
              ? allImages.map((item, index) =>
                <button
                  key={`${item.url}-${index}`}
                  type="button"
                  aria-label={`Ver item ${index + 1}`}
                  className={`mr-2 h-2 w-2 rounded-full border-0 p-0 ${index === currentCarouselImage ? "bg-brand" : "bg-slate-300"}`}
                  onClick={() => setCurrentCarouselImage(index)}
                />
              )
              : <></>
            }
          </div>        
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <div className={`flex cursor-pointer items-center gap-1 ${isLoading.like ? "opacity-50" : "text-blue-600"}`} onClick={handleNewLike}>
              { isActionType.like ? <AiFillLike /> : <AiOutlineLike /> } { likes.length }
            </div>

            <div 
              className={`flex cursor-pointer items-center gap-1 ${isLoading.dislike ? "opacity-50" : "text-red-600"}`} 
              onClick={handleNewDislike}
            >
              { isActionType.dislike ? <AiFillDislike /> : <AiOutlineDislike /> } { dislikes.length }
            </div>

            <div className="flex cursor-pointer items-center gap-1 text-slate-600" onClick={() => setShowComments(showComments == false)}>
              <AiOutlineComment /> Comentários 
            </div>
          </div>

          <div className="shrink-0 text-xs text-slate-500">
            { postInfo.created_on }
          </div>
        </footer>
        <div className="flex items-center justify-between py-2">
          <div className="flex">
            {
              previewActions.map((action) => 
                <div key={action.user_id} style={{borderColor: action.like ? "blue" : "red" }} className="h-6 w-6 overflow-hidden rounded-full border-2">
                  <img src={action.image_url}/>
                </div>
              )
            }
          </div>

          <div className="text-xs text-slate-500">
            { previewActions.length > 0 ? (
                <>
                  {previewActions.map(
                    (action, index) =>
                      <span key={action.user_id}>
                        <Link href={`/profile/${action.user_id}`}>
                        { action.username?.split(" ")[0] + (index+1 < previewActions.length ? ", " : "") } 
                        </Link>
                      </span>
                  )}
                  { previewActions.length > 1 ? 
                    likes.length+dislikes.length > 4 ? " e outras "+(likes.length+dislikes.length-4)+" reagiram." : " reagiram" 
                    : " reagiu." 
                  }
                  <span 
                    className="ml-1 cursor-pointer text-brand underline"
                    onClick={() => setModalIsOpen(true)}
                  >ver todos</span>
                </>
              )
              : ""
            }
          </div>
        </div>

        { showComments ? (
         <Comments
            postID={postInfo.id}
          />
        ) : ("")}

      </div>
    );

  else if (postIsDeleted == 1)
    return (
      <div className="mt-4 rounded-xl bg-slate-100 p-4 text-slate-500">
        <div>Esta postagem foi removida</div>
      </div>
  );

  else return <></>;
  
}