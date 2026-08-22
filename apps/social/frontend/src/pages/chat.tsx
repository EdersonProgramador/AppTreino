import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks";
import { isMobile } from "react-device-detect";
import { IoMdClose, IoIosArrowForward } from "react-icons/io";
import { HiStatusOnline } from "react-icons/hi";
import { MdSensorsOff, MdUpdate } from "react-icons/md";
import { AiOutlineGlobal } from "react-icons/ai";
import Link from "@/lib/legacy-link";
import { BiSend } from "react-icons/bi";
import { ImSpinner2 } from "react-icons/im";
import Head from "next/head";



export default function Chat() {
  const { allUsers, sendMessage, allMessages, getIndexOfMessage, isLoadingMessages, waitNewMessage } = useSocket();
  const [newMessage, setNewMessage] = useState("");
  const [menuMobileIsOpen, setMenuMobileIsOpen] = useState(false);
  const messagesContainerRef = useRef(null);

  function verifyMessage() {
    if (newMessage.length > 0) {
      sendMessage(newMessage, messagesContainerRef);

      setNewMessage("");
    }
  }

  function scrollChat(ref) {
    document.body.scrollTo(0, 999);
    ref.current.scrollTo(0, 0);
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      scrollChat(messagesContainerRef);

      if (menuMobileIsOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "auto";
      } 
    }
  }, [menuMobileIsOpen]);

  return (
    <main className="flex min-h-[calc(100dvh-5rem)] w-full justify-between">
      <Head><title>Chat global</title></Head>
      {
        isMobile
        ? <div
          className="absolute left-0 z-10 rounded-r-2xl bg-white p-3 shadow-lg"
          onClick={() => setMenuMobileIsOpen(true)}
        ><IoIosArrowForward /></div>
        : null
      }
      <section
        className="w-[30%] bg-white p-4 max-lg:absolute max-lg:left-0 max-lg:top-0 max-lg:z-[99] max-lg:h-full max-lg:w-[85%]"
        style={{ left: menuMobileIsOpen ? "0" : "-100%"}}
      >

        <h2 className="mb-4 flex items-center justify-between text-lg font-medium">
          Chat em tempo real
          { isMobile ? <IoMdClose onClick={() => setMenuMobileIsOpen(false)} /> : null}
        </h2>

        <div className="mb-1 flex items-center text-sm">Onlines agora <HiStatusOnline className="ml-1 text-brand" /></div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
          {
            allUsers.map((user, index) => user.isOnline
              ? <div key={index} className="rounded-xl bg-mist p-2">
                <Link href={`/profile/${user.id}`}>
                  <a>
                    <div className="relative mx-auto h-8 w-8 overflow-hidden rounded-full">
                      <img
                        src={user.image_url}
                        alt={"user profile chat"}
                      />

                      <span
                        className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: user.isOnline ? "var(--online)" : "var(--offline)" }}
                      ></span>
                    </div>

                    <div className="text-xs">{user.username.split(" ")[0]}</div>
                  </a>
                </Link>
              </div>
              : ""
            )
          }
        </div>

        <div className="mb-1 flex items-center text-sm">Outros usuários (Offline) <MdSensorsOff className="ml-1 text-red-600" /></div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
          {
            allUsers.map((user, index) => !user.isOnline
              ? <div key={index} className="rounded-xl bg-mist p-2">
                <Link href={`/profile/${user.id}`}>
                  <a>
                    <div className="relative mx-auto h-8 w-8 overflow-hidden rounded-full">
                      <img
                        src={user.image_url}
                        alt={"chat user"}
                      />

                      <span
                        className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: user.isOnline ? "var(--online)" : "var(--offline)" }}
                      ></span>
                    </div>

                    <div className="text-xs">{user.username.split(" ")[0]}</div>
                  </a>
                </Link>
              </div>
              : ""
            )
          }
        </div>

        <div className="flex cursor-pointer items-center rounded-xl bg-blue-50 p-3"
          onClick={() => document.querySelector("textarea").focus()}
        >
          <AiOutlineGlobal />
          <div>
            <span> Chat global</span>
            <small>({allUsers.filter(aUser => aUser.isOnline).length} Online agora)</small>
          </div>
        </div>

      </section>

      {
        isMobile && menuMobileIsOpen
        ? <div className="absolute inset-0 z-[98] h-screen w-screen bg-black/50" onClick={() => setMenuMobileIsOpen(false)}></div>
        : null
      }


      <section className="z-[1] flex w-[69%] flex-col-reverse overflow-y-auto bg-white max-lg:-mx-3 max-lg:w-screen" ref={messagesContainerRef}>
        <div className="min-h-[120px] p-2">
          <div className={`relative flex h-full items-end gap-2 bg-white ${waitNewMessage ? "opacity-50" : ""}`}>
            <textarea
              value={newMessage}
              onChange={({target}) => setNewMessage(target.value)}
              placeholder={"Envie uma mensagem"}
              onKeyDown={e => e.key === "Enter" ? (verifyMessage(), e.preventDefault()) : null}
              disabled={waitNewMessage}
              className="form-input min-h-[3rem] resize-none pr-12"
            >
            </textarea>

            <button
              onClick={verifyMessage}
              disabled={waitNewMessage || newMessage.length === 0}
              className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white"
            >
              {waitNewMessage ? <div className="loadingContainer"><BiSend /></div> : <BiSend />}
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse p-4">
          {allMessages.map((message, index) =>
              <div
                key={index}
                className={`mb-3 flex items-end gap-2 ${message.isMy ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[75%]">

                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    {message.content}
                    <div className="mt-1 h-1 w-1" />
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {message.createdOn}
                  </div>

                </div>

                <div className="h-8 w-8 overflow-hidden rounded-full">
                  <Link href={`/profile/${message.googleID}`}>
                    <a>
                      <img src={message.image} alt={"messages user profile"} />
                    </a>
                  </Link>
                </div>

              </div>
            )}

          { isLoadingMessages ? <div className={`loadingContainer`}><ImSpinner2 /></div> : "" }          

          {
            allMessages.length > 0
            ? <div onClick={() => getIndexOfMessage()} className="my-3 flex cursor-pointer items-center justify-center text-sm text-slate-500">Carregar mais messages <MdUpdate className="ml-1" /></div>
            : <></>
          }
          
        </div>
      </section>
    </main>
  );
}