import { IoClose } from "react-icons/io5";
import { AiFillLike, AiFillDislike } from "react-icons/ai";
import { BiCommentDetail } from "react-icons/bi";
import { useEffect, useState } from "react";
import { api } from "@/lib";
import { LikeOrDislike } from "@/types";
import { CgSpinner } from "react-icons/cg";
import Link from "@/lib/legacy-link";
import { MdStickyNote2 } from "react-icons/md";


interface Comment {
  commentID: number
  content: string;
  created_on: string;
  image_url: string;
  userID: string;
  username: string;
}

interface ActionModal {
  index: number;
  data: any;
}


interface ActionModalProps {
  modalIsOpen: boolean;
  setModalIsOpen: (args: boolean) => void;
  postId: number;
}

export function ActionModal({ modalIsOpen, setModalIsOpen, postId }: ActionModalProps) {
  const [selectedOption, setSelectedOption] = useState<ActionModal>({
    index: 0,
    data: [] // Array de likes, de dislikes ou de comentários
  });
  const [loading, setLoading] = useState(false);



  async function updateActions() {
    if (selectedOption.index == 0 || selectedOption.index == 1) {
      setLoading(true);
      const { data }: any = await api().post("/posts/actions", { postID: postId });
      setLoading(false);

      setSelectedOption({ ...selectedOption, 
        data: selectedOption.index == 0 
        ? [...data.likes]
        : [...data.dislikes]
      });
      
    } else {
      setLoading(true);
      const { data } = await api().get(`/posts/comments/${postId}`);
      setLoading(false);

      if (data.success) {
        setSelectedOption({ ...selectedOption, data: data.comments });
      }
    }    
  }

  useEffect(() => {
    updateActions();
  }, [selectedOption.index]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (modalIsOpen) {
        updateActions();
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "auto";
      }
    }
  }, [modalIsOpen]);

  if (modalIsOpen) {
    return (
      <div className="fixed inset-0 z-[999] flex h-screen w-screen items-center justify-center">
        <div className="fixed inset-0 h-screen w-screen bg-black/70" onClick={() => setModalIsOpen(false)}></div>

        <section className="relative z-[112] flex h-[65vh] w-[40vw] flex-col rounded-2xl bg-white p-6 shadow-soft max-lg:h-[70vh] max-lg:w-[90vw]">
          <IoClose  className="absolute right-4 top-4 cursor-pointer text-xl" onClick={() => setModalIsOpen(false)}/>

          <header className="mb-4">
            <div className="flex items-center justify-between">
              <div className={`
                flex cursor-pointer items-center rounded-lg border-b-2 border-transparent px-3 py-2 text-brand
              `}
                style={selectedOption.index == 0 ? { borderBottomColor: "var(--default-blue)"} : {}}
                onClick={() => !loading ? setSelectedOption({ index: 0, data: [] }) : null}
              ><AiFillLike /> Likes</div>
              
              <div className={`
                flex cursor-pointer items-center rounded-lg border-b-2 border-transparent px-3 py-2 text-red-600
              `}
                style={selectedOption.index == 1 ? { borderBottomColor: "var(--offline)"} : {}}
                onClick={() => !loading ? setSelectedOption({ index: 1, data: [] }) : null}
              ><AiFillDislike /> Dislikes</div>

              <div className={`
                flex cursor-pointer items-center rounded-lg border-b-2 border-transparent px-3 py-2 text-slate-600
              `}
                style={selectedOption.index == 2 ? { borderBottomColor: "var(--default-blue)"} : {}}
                onClick={() => !loading ? setSelectedOption({ index: 2, data: [] }) : null}
              ><BiCommentDetail /> Comentários</div>

            </div>

            <hr />
          </header>

          <section className="h-full overflow-y-auto pr-1">
            { loading ? <div className="loadingContainer mt-4 text-2xl"><CgSpinner /></div> : "" }
            {
              selectedOption.index == 0 || selectedOption.index == 1 // Likes or dislikes
              ? (
                <div>
                  { selectedOption.data.length > 0 
                    ? selectedOption.data.map((option: LikeOrDislike) => 
                      <div key={option.image_url} className="mt-2 flex items-center justify-between rounded-xl bg-mist p-2">
                        <Link href={`/profile/${option.user_id}`}>
                          <a>
                            <div className="mr-2 h-8 w-8 overflow-hidden rounded-full"><img src={option.image_url} /></div>
                            <div>{option.username}</div>
                          </a>
                        </Link>
                        <div className="opacity-70" style={{ color: selectedOption.index == 0 ? "var(--default-blue)" : "var(--offline)" }}>
                          {selectedOption.index == 0 ? <AiFillLike /> : <AiFillDislike />}  
                        </div>
                      </div>
                    ) : (
                      <div className="mt-12 flex flex-col items-center justify-center text-center text-slate-400">
                        <div className="text-xl font-medium">Por enquanto não há nada aqui.</div>
                        <MdStickyNote2 />
                      </div>
                    )
                  }
                </div>
              ) : (
                <div>
                  { selectedOption.data.length > 0
                    ? selectedOption.data.map((option: Comment) => 
                      <div key={option.created_on} className="mt-2 rounded-xl bg-mist p-2">
                        <header>
                          <Link href={`/profile/${option.userID}`}>
                            <a>
                              <div className="h-8 w-8 overflow-hidden rounded-full">
                                <img src={option.image_url} alt={"preview comment, user: "+option.username}/>
                              </div>
                              
                              <div className="ml-2 text-slate-600">{option.username}</div>
                            </a>
                          </Link>
                        </header>

                        <section className="ml-8 break-words">{option.content}</section>
                      </div>
                    ) : (
                      <div className="mt-12 flex flex-col items-center justify-center text-center text-slate-400">
                        <div className="text-xl font-medium">Por enquanto não há nada aqui.</div>
                        <MdStickyNote2 />
                      </div>
                    )
                  }
                </div>
              )
            }
          </section>
        </section>
      </div>
    );
  } else {
    return <></>;
  }
}