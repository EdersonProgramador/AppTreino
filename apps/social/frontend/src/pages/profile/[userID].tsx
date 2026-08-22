import { Post } from "@/components/post";
import { api } from "@/lib";
import { Edit } from "@/components/profile";
import { useAuth } from "@/hooks";
import { User } from "@/types";
import { useEffect, useState } from "react";
import ReactModal from "react-modal";
import { RiAddFill } from "react-icons/ri";
import { CgSpinnerTwoAlt } from "react-icons/cg";
import { TbEdit } from "react-icons/tb";
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import Router, { useRouter } from "next/router";
import { toast } from "react-toastify";


ReactModal.setAppElement("#__next") 

interface ProfileProps {
  user: User;
  isMyProfile: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  followPending: boolean;
  canSeePosts: boolean;
}

export default function Profile({ user: serverUSer, isMyProfile, isFollowing, isBlocked, isMuted, followPending, canSeePosts }: ProfileProps) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(isFollowing);
  const [blocked, setBlocked] = useState(isBlocked);
  const [muted, setMuted] = useState(isMuted);
  const [pending, setPending] = useState(followPending);
  const [loadingAction, setLoadingAction] = useState(false);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const { user: myUser } = useAuth();
  const [user, setUser] = useState({ ...serverUSer });
  const [followerAmount, setFollowerAmount] = useState(Number(serverUSer.followers));

  useEffect(() => {
    setUser({ ...serverUSer });
  }, [serverUSer])
  
  useEffect(() => {
    if (!canSeePosts) {
      setPosts([]);
      return;
    }

    (async() => {
      setLoading(true);

      const { data } = await api().get(`/user/posts/${user.id}`);

      setLoading(false);

      if (data.success) {
        setPosts(data.posts);
      }

    })();
  }, [user.id, canSeePosts]);

  async function follow() {
    if (!loadingAction) {
      setLoadingAction(true);

      const { data } = await api().put("/user/new-follow", { 
        followerID: user.id 
      });
      
      setLoadingAction(false);

      if (data.success) {
        setPending(Boolean(data.pending));
        setFollowing(!data.pending);
        if (!data.pending) {
          setFollowerAmount(followerAmount+1);
        }
      } else {
        alert("Erro ao seguir usuário");
      }      
    }

  }

  async function unFollow() {
    if (!loadingAction) {
      setLoadingAction(true);

      const { data } = await api().delete(`/user/unfollow/${user.id}`);

      setLoadingAction(false);

      if (data.success) {
        if (following) {
          setFollowerAmount(followerAmount-1);
        }
        setFollowing(false);
        setPending(false);
      } else {
        alert("Erro ao parar de seguir usuário.");
      }

    }
  }

  async function blockUser() {
    if (!window.confirm(`Bloquear ${user.username}? Vocês deixam de se seguir e não verão mais o conteúdo um do outro.`)) {
      return;
    }

    try {
      const { data } = await api().post("/user/block", { userId: user.id });
      if (data?.success) {
        toast.success("Usuário bloqueado.");
        setBlocked(true);
        setFollowing(false);
      }
    } catch {
      toast.warning("Não foi possível bloquear.");
    }
  }

  async function unblockUser() {
    try {
      const { data } = await api().delete(`/user/block/${user.id}`);
      if (data?.success) {
        toast.success("Usuário desbloqueado.");
        setBlocked(false);
      }
    } catch {
      toast.warning("Não foi possível desbloquear.");
    }
  }

  async function muteUser() {
    try {
      const { data } = muted
        ? await api().delete(`/user/mute/${user.id}`)
        : await api().post("/user/mute", { userId: user.id });
      if (data?.success) {
        setMuted(!muted);
      }
    } catch {
      toast.warning("Não foi possível silenciar.");
    }
  }

  async function reportUser() {
    const reason = window.prompt("Descreva o motivo da denúncia:");
    if (!reason || reason.trim().length < 3) {
      return;
    }

    try {
      const { data } = await api().post("/user/report", {
        targetType: "user",
        targetUserId: user.id,
        reason
      });
      toast.success(data?.message || "Denúncia registrada.");
    } catch {
      toast.warning("Não foi possível denunciar.");
    }
  }

  return (
    <div className="w-full lg:w-[70%]">
      <Head><title>{`${user.username} - Perfil`}</title></Head>

      {
        isMyProfile
        ? <Edit 
          user={user} 
          setUser={setUser}
          useModalIsOpen={{ modalIsOpen, setModalIsOpen }}
        />
        : <></>
      }

      <header className="-mx-2 bg-white sm:-mx-5">
        <div className="relative min-h-[150px]" style={{ background: user.cover_color }}>
          {
            isMyProfile 
            ? <div 
              className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow-lg"
              onClick={() => setModalIsOpen(true)}
            ><TbEdit /></div>
            : <></>
          }

          <h2 className="absolute bottom-4 right-4 rounded-lg bg-white/70 p-2 text-lg font-medium">
            { user.username }
          </h2>
        </div>

        <div className="flex flex-col justify-between gap-4 p-4 pb-6 sm:flex-row">

          <div>

            <div className="flex items-center">
              <div className="mr-4 h-24 w-24 -translate-y-8 overflow-hidden rounded-full border-4 border-white">
                <img src={user.image_url} alt={"profile"} />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <strong>{user.following}</strong> 
              <span>Seguindo</span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <strong>{followerAmount}</strong>
              <span>{followerAmount > 1 || followerAmount == 0 ? "Seguidores" : "Seguidor"}</span>
            </div>

            <div className="mt-2 text-slate-600">{user.bio}</div>

            <div className="mt-2 text-sm text-slate-500">Usuário desde {user.created_on}</div>
          </div>

          {
            !isMyProfile 
            ? (
              <div className="flex flex-col items-stretch gap-2 sm:min-w-[12rem]">
                <button 
                  className={`flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium ${following ? "border border-slate-300 bg-slate-100 text-ink" : "bg-brand text-white"}`}
                  disabled={loadingAction}
                  onClick={following || pending ? unFollow : follow}
                >
                  { following ? "Seguindo" : pending ? "Solicitado" : <>Seguir <RiAddFill /></> }
                </button>
                <Link href={`/messages/${user.id}`}>
                  <a className="rounded-xl border border-slate-200 px-6 py-3 text-center text-sm font-medium text-ink">Mensagem</a>
                </Link>
                <button
                  type="button"
                  className="rounded-xl border-0 bg-slate-100 px-6 py-3 text-sm font-medium text-ink"
                  onClick={blocked ? unblockUser : blockUser}
                >
                  {blocked ? "Desbloquear" : "Bloquear"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border-0 bg-slate-100 px-6 py-3 text-sm font-medium text-ink"
                  onClick={muteUser}
                >
                  {muted ? "Parar de silenciar" : "Silenciar"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border-0 bg-red-50 px-6 py-3 text-sm font-medium text-red-700"
                  onClick={reportUser}
                >
                  Denunciar
                </button>
              </div>
            ) : <></>
          }


        </div>

      </header>

      <section>

        <h2>
        {
          isMyProfile 
          ? `Minhas publicações (${posts.length})`
          : `Publicações de ${user.username.split(" ")[0]}`
        }
        </h2>

        <hr />

        {
          loading
            ? <div className="loadingContainer mt-4 text-2xl"><CgSpinnerTwoAlt /></div>
            : <></>
          }

        {
          !canSeePosts && !loading
          ? (
              <div className="my-8 rounded-xl border-l-2 border-slate-400 bg-white/70 p-4 text-lg">Esta conta é privada. Envie um pedido para seguir.</div>
          ) : posts.length === 0 && !loading
          ? (
              <div className="my-8 rounded-xl border-l-2 border-slate-400 bg-white/70 p-4 text-lg">Nenhuma publicação ainda :(</div>
          ) : (
            posts.map(post =>
              <Post
                key={post.id}
                data={post}
                currentUserId={myUser?.id}
              />
            )
          )
        }
      </section>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const { params } = context;
    const { data: { user } } = await api(context).get("/user/current");

    if (!user) {
      return {
        redirect: { destination: "/auth/login", permanent: false }
      };
    }

    const { data } = await api(context).get(`/user/profile/${params.userID}`);

    if (data.userExists) {
      return {
        props: {
          key: params.userID,
          user: data.user,
          isMyProfile: user.id === data.user.id,
          isFollowing: data.isFollowing,
          isBlocked: Boolean(data.isBlocked),
          isMuted: Boolean(data.isMuted),
          followPending: Boolean(data.followPending),
          canSeePosts: Boolean(data.canSeePosts)
        }
      };
    }

    return { notFound: true };
  } catch {
    return {
      redirect: { destination: "/auth/login", permanent: false }
    };
  }
}