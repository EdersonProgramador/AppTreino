import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "@/lib/legacy-link";
import { BiMessageAltX } from "react-icons/bi";
import { MdAddCircle } from "react-icons/md";
import { BsArrowReturnRight } from "react-icons/bs";
import { ImSpinner } from "react-icons/im";
import { api } from "@/lib";



export function Comments({ postID }) {
	const [allComments, setAllComments] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [newCommentLoading, setNewCommentLoading] = useState(false);
  const [newComment, setNewComment] = useState("");

	async function getComments() {
		setIsLoading(true);

		const { data } = await api().get(`/posts/comments/${postID}`);

		setIsLoading(false);

		if (data.success) {
			console.log("success")

			setAllComments(data.comments)

		} else {
			alert("Erro ao buscar comentários");
		}
	}

	async function handleAddComment() {
		setNewComment("");
		setNewCommentLoading(true);

		const { data } = await api().put("/posts/new-comment", { 
			postID, 
			content: newComment
		});

		setNewCommentLoading(false);

		if (data.success) {
			getComments();
		} else {
			alert("Erro ao adicionar comentário");
		}

	}

	useEffect(() => {
		getComments();
	}, []);

	return (
		<div className="pt-8">
			<h3 className="text-lg font-medium text-ink">Comentários</h3>

			<hr className="my-3 border-slate-100" />

			<div className="pt-4">
	      <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
	        <input 
	          type="text" 
	          value={newComment}
	          placeholder={"Diga algo sobre essa publicação"}
	          onChange={({target}) => newComment.length < 200 ? setNewComment(target.value) : null}
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate-400"
	        />

	        <button 
	        	disabled={newComment.length == 0}
	        	onClick={handleAddComment}
	        	className={`flex h-9 w-9 items-center justify-center rounded-full bg-brand text-lg text-white ${newCommentLoading ? "loadingContainer" : ""}`}
	        ><MdAddCircle /></button>
	      </div>

				<div 
					className={`text-sm ${newComment.length < 100 ? "text-green-600" : newComment.length < 200 ? "text-yellow-500" : "text-red-600"}`}
				>
					{newComment.length}/200
				</div>

				{
					isLoading ? <div className="loadingContainer mb-4 text-xl"><ImSpinner /></div> : <></>
				}
				{
					allComments.length == 0 
					? <div className="flex items-center justify-center text-center text-slate-400"><BiMessageAltX/> Nenhum comentário disponível</div>
					:
					allComments.map((comment) => 
						<div key={comment.commentID} className="mt-4 rounded-xl border border-slate-200 bg-white p-3">

							<header className="mb-2 flex items-center justify-between">
								<Link href={`/profile/${comment.userID}`}>
									<a className="flex items-center">
										<div className="h-7 w-7 overflow-hidden rounded-full">
											<img 
												src={comment.image_url}
												alt={"comment user"}
											/>
										</div>

										<div className="ml-2 text-sm text-slate-500">{comment.username}</div>
									</a>
								</Link>

								<div className="text-xs text-slate-400">
									{comment.created_on.replace(",", "/").replace(",", "/").replace(",", " às " )}
								</div>
							</header>

							<section className="flex items-start gap-2 text-sm text-slate-600">
								<BsArrowReturnRight/>
								
								<div className="max-w-[95%] break-words overflow-hidden">
									{ comment.content }
								</div>	
							</section>


						</div>
					)
				}
			</div>
		</div>
	);
}