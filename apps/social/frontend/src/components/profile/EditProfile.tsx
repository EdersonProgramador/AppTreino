import ReactModal from "react-modal";
import { IoClose } from "react-icons/io5";
import { MdAddPhotoAlternate } from "react-icons/md";
import { BiRightArrowAlt } from "react-icons/bi";
import { useEffect, useState } from "react";
import { ImSpinner10 } from "react-icons/im";
import { toast } from "react-toastify";
import { BsPatchCheckFill } from "react-icons/bs";
import { User } from "@/types";
import { useAuth } from "@/hooks";
import { api } from "@/lib";




interface EditProps {
  user: User;
  setUser: (newState: User) => void;
  useModalIsOpen: {
    modalIsOpen: boolean;
    setModalIsOpen: (args: boolean) => void;
  }
}

interface FinishChangesProps {
  bio: string;
  name: string;
  picture: null | File;
  cover_color: string | null;
  currentPassword: string;
  newPassword: string;
  id: string;
  is_private: boolean;
}

export function Edit({ user, setUser, useModalIsOpen }: EditProps) {
  const { modalIsOpen, setModalIsOpen } = useModalIsOpen;
  const { user: currentUser, logOut, updateUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [changeUserInfo, setChangesUserInfo] = useState<FinishChangesProps>({
    bio: user?.bio,
    cover_color: user?.cover_color,
    currentPassword: "",
    newPassword: "",
    name: user?.username,
    picture: null,
    id: user?.id,
    is_private: Boolean(user?.is_private)
  });
  const colors = ["#009688", "#607d8b", "#2F5BAC", "#795548", "#2196f3", "#9900ef", "#ff9800", "#ff5722", "#8bc34a", "#9c27b0", "#4db6ac"]
  const [haveChanges, setHaveChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (
      (changeUserInfo.bio !== user.bio || 
      changeUserInfo.cover_color !== user.cover_color ||
      changeUserInfo.name !== user.username ||
      changeUserInfo.is_private !== Boolean(user.is_private) ||
      changeUserInfo.picture !== null ||
      changeUserInfo.newPassword !== "" ||
      changeUserInfo.currentPassword !== "") 
      && !haveChanges
    )
      setHaveChanges(true);
    else if (
      (changeUserInfo.bio === user.bio && 
        changeUserInfo.cover_color === user.cover_color &&
        changeUserInfo.name === user.username &&
        changeUserInfo.is_private === Boolean(user.is_private) &&
        changeUserInfo.picture === null &&
        changeUserInfo.newPassword === "" &&
        changeUserInfo.currentPassword === "") 
        && haveChanges
    )
        setHaveChanges(false);
  }, [changeUserInfo]);


  async function submitChanges() {
    const dataForm = new FormData();

    if (changeUserInfo.picture) {
      dataForm.append("picture", changeUserInfo.picture);
    }

    dataForm.append("body", JSON.stringify({ ...changeUserInfo }));

    setIsLoading(true);

    const { data } = await api().post("/user/update-info", 
    dataForm, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    setIsLoading(false);

    if (data.success) {
      toast.success("Alteração salva.");

      setUser({
        ...user,
        bio: changeUserInfo.bio,
        cover_color: changeUserInfo.cover_color,
        image_url: changeUserInfo.picture ? URL.createObjectURL(changeUserInfo.picture) : user.image_url,
        username: changeUserInfo.name,
        is_private: changeUserInfo.is_private
      });
      
      setChangesUserInfo({
        ...changeUserInfo,
        newPassword: "",
        currentPassword: "",
        picture: null
      });

      updateUser();

      setModalIsOpen(false);
    } else {
      toast.warn(data.message);
    }
  }

  async function exportData() {
    try {
      const { data } = await api().get("/user/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meus-dados.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.warning("Não foi possível exportar seus dados.");
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Excluir sua conta e todos os dados associados?")) {
      return;
    }

    try {
      const { data } = await api().delete("/user/me");
      if (data?.success) {
        logOut();
      }
    } catch {
      toast.warning("Não foi possível excluir a conta.");
    }
  }

  useEffect(() => {
    if (modalIsOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "auto"
    }
  }, [modalIsOpen]);

  return (
    <ReactModal
      isOpen={modalIsOpen}
      onRequestClose={() => setModalIsOpen(false)}
      overlayClassName={"modalOverlay"}
      className={"modal-content"}
    >
      <IoClose
        className="close-modal-icon"
        onClick={() => setModalIsOpen(false)}
      />

      <form onSubmit={e => e.preventDefault()}>
        <section className="mb-4">
          <h2 className="mb-6 text-2xl font-medium text-ink">
            <div>Customização</div>
            <hr />
          </h2>

          <h3 className="mt-8 text-lg font-medium text-ink">
            <div>Foto de perfil</div>
            <hr />
          </h3>

          <div className="flex items-start gap-2">
            <div>
              <div className="m-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-200">
                <img src={currentUser?.picture} alt={"user profile"}/>
              </div>

              <div className="rounded-lg bg-mist p-2 text-center text-xs font-medium">Antes</div>
            </div>

            <BiRightArrowAlt className="self-center text-2xl text-slate-300" />

            <div>
              <label htmlFor="select-image" className="m-2 flex h-24 w-24 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-mist text-center">
                {
                  !changeUserInfo.picture
                  ? <>
                    <MdAddPhotoAlternate />
                    <span>Nenhuma foto selecionada</span>                  
                  </>
                  : <img src={URL.createObjectURL(changeUserInfo.picture)} alt={"preview user picture"} />
                }
              </label>
              
              { 
                changeUserInfo.picture 
                ? <div 
                    className="mt-1 cursor-pointer rounded-lg bg-red-600 p-2 text-center text-xs font-medium text-white" 
                    onClick={() => {
                      setChangesUserInfo({ ...changeUserInfo, picture: null });
                      (document.getElementById("select-image") as HTMLInputElement).value = null
                    }
                    }>
                      Remover</div> 
                : <div className="rounded-lg bg-mist p-2 text-center text-xs font-medium">Depois</div>
              }

              <input
                id={"select-image"}
                type={"file"}
                className="hidden"
                onChange={({target}) =>
                  setChangesUserInfo({
                    ...changeUserInfo,
                    picture: target.files[0]
                  })
                }
              />

            </div>
          </div>

          <h3 className="mt-8 text-lg font-medium text-ink">
            <div>Cor da capa</div>
            <hr />
          </h3>

          <div className="flex flex-wrap gap-4">
            {
              colors.map((item) => 
                <div 
                  key={item}
                  className="flex flex-col items-center text-center" 
                > 
                  <div 
                    style={{ background: item }} 
                    className={`flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-md transition hover:scale-105 ${changeUserInfo.cover_color == item ? "scale-90" : ""}`}
                    onClick={() => setChangesUserInfo({ ...changeUserInfo, cover_color: item })}
                  >
                    {changeUserInfo.cover_color == item ? <BsPatchCheckFill /> : null}
                  </div>
                  <div className="mt-1 w-full rounded-lg bg-mist p-1 text-xs">{item}</div>
                </div>
              )
            }
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-2xl font-medium text-ink">
            <div>Dados pessoais</div>
            <hr />
          </h2>

          <div className="mt-4">
            <label className="form-label">Nome</label>
            <input
              onChange={({target}) => setChangesUserInfo({ ...changeUserInfo, name: target.value })}
              value={changeUserInfo.name}
              placeholder={"Seu novo nome"}
              className="form-input"
            />
          </div>

          <div className="mt-4">
            <label className="form-label">Bio (biográfia)</label>
            <input
              onChange={({target}) => setChangesUserInfo({ ...changeUserInfo, bio: target.value })}
              value={changeUserInfo.bio}
              placeholder={"Sua bio"}
              className="form-input"
            />
          </div>

          <div className="mt-4 opacity-60">
            <label className="form-label">Email <span className="text-xs font-normal"> (Não editável)</span></label>
            <input disabled={true} defaultValue={currentUser?.email} className="form-input"/>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-ink">
            <input
              id="is-private"
              type="checkbox"
              className="form-check"
              checked={changeUserInfo.is_private}
              onChange={({ target }) => setChangesUserInfo({ ...changeUserInfo, is_private: target.checked })}
            />
            <label htmlFor="is-private">Conta privada (pedidos para seguir)</label>
          </div>

          <h3 className="mt-8 text-lg font-medium text-ink">
            <div>Alteração de senha <span className="text-xs font-normal">(Deixe em branco se não deseja alterar)</span></div>
            <hr />
          </h3>          
          
          {
            user.havePassword
            ? <div className="mt-4">
              <label className="form-label">Senha atual</label>
              <input
                onChange={({target}) => setChangesUserInfo({ ...changeUserInfo, currentPassword: target.value })}
                value={changeUserInfo.currentPassword}
                placeholder={"Sem alterações"}
                type={showPassword ? "text" : "password"}
                className="form-input"
              />
            </div>
            : <></>
          }

          <div className="mt-4">
            <label className="form-label">Nova senha</label>
            <input
              onChange={({target}) => setChangesUserInfo({ ...changeUserInfo, newPassword: target.value })}
              value={changeUserInfo.newPassword}
              placeholder={"Sem alterações"}
              type={showPassword ? "text" : "password"}
              className="form-input"
            />
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <input
              id={"show-password"}
              type={"checkbox"}
              className="form-check"
              onChange={({target}) => setShowPassword(target.checked)}
            />
            <label htmlFor="show-password">Mostrar senha</label>
          </div>  
          
          {
            isLoading
            ? <div className="loadingContainer text-2xl">
              <ImSpinner10 />
            </div>
            : <></>
          }
            
          <div className="mt-4 flex items-center justify-end gap-3">
            <button 
              className="rounded-xl border-0 bg-slate-600 px-6 py-3 text-sm font-medium text-white"
              onClick={() => {
                setChangesUserInfo({
                  bio: user?.bio,
                  cover_color: user?.cover_color,
                  currentPassword: "",
                  newPassword: "",
                  name: user?.username,
                  picture: null,
                  id: user?.id,
                  is_private: Boolean(user?.is_private)
                });
                setModalIsOpen(false);
              }}
            >Cancelar</button>
            <button 
              type={"submit"} 
              className="rounded-xl border-0 bg-brand px-6 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" 
              onClick={submitChanges}
              disabled={!haveChanges || isLoading}
            >
              Salvar alterações</button>          
          </div>

          <div className="mt-10 rounded-2xl border border-slate-100 bg-mist p-4">
            <h3 className="text-lg font-medium text-ink">Seus dados (LGPD)</h3>
            <p className="mt-1 text-sm text-slate-500">Baixe um arquivo JSON com o que está associado à sua conta.</p>
            <button
              type="button"
              className="mt-3 rounded-xl border-0 bg-white px-4 py-2 text-sm font-medium text-ink"
              onClick={exportData}
            >
              Exportar meus dados
            </button>
          </div>

          <div className="mt-10 rounded-2xl border border-red-100 bg-red-50 p-4">
            <h3 className="text-lg font-medium text-red-700">Excluir conta</h3>
            <p className="mt-1 text-sm text-red-700/80">Remove seu perfil, publicações, seguidores e mensagens. Esta ação não pode ser desfeita.</p>
            <button
              type="button"
              className="mt-3 rounded-xl border-0 bg-red-600 px-4 py-2 text-sm font-medium text-white"
              onClick={deleteAccount}
            >
              Excluir minha conta
            </button>
          </div>

        </section>
      </form>

    </ReactModal>
  );
}