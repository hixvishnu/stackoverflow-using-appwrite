import { databases } from "@/models/client/config"
import {
  answerCollection,
  db,
  questionCollection,
  voteCollection,
} from "@/models/name"
import { users } from "@/models/server/config"
import { UserPrefs } from "@/store/Auth"
import { NextRequest, NextResponse } from "next/server"
import { ID, Query } from "node-appwrite"

export async function POST(request: NextRequest) {
  try {
    const { votedById, voteStatus, type, typeId } = await request.json()

    const response = await databases.listDocuments(db, voteCollection, [
      Query.equal("type", type),
      Query.equal("typeId", typeId),
      Query.equal("voteById", votedById),
    ])

    if (response.documents.length > 0) {
      await databases.deleteDocument(
        db,
        voteCollection,
        response.documents[0].$id
      )

      //decrease the reputation of the question/answer author
      const questionOrAnswer = await databases.getDocument(
        db,
        type === "question" ? questionCollection : answerCollection,
        typeId
      )

      const authorPrefs = await users.getPrefs<UserPrefs>(
        questionOrAnswer.authorId
      )

      await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
        reputation:
          response.documents[0].voteStatus === "upvoted"
            ? Number(authorPrefs.reputation) - 1
            : Number(authorPrefs.reputation) + 1,
      })
    }

    // that means prev vote does not exists or voteStatus changed
    if (response.documents[0]?.voteStatus !== voteStatus) {
      const doc = await databases.createDocument(
        db,
        voteCollection,
        ID.unique(),
        {
          type,
          typeId,
          voteStatus,
          votedById,
        }
      )

      //increase/decrease the reputation of the question/answer author accordingly
      const questionOrAnswer = await databases.getDocument(
        db,
        type === "question" ? questionCollection : answerCollection,
        typeId
      )

      const authorPrefs = await users.getPrefs<UserPrefs>(
        questionOrAnswer.authorId
      )

      //if vote was present
      if (response.documents[0]) {
        await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
          reputation:
            // that means pre vote was "upvoted" and new value is "downvoted"
            response.documents[0].voteStatus === "upvoted"
              ? Number(authorPrefs.reputation) + 1
              : Number(authorPrefs.reputation) - 1,
        })
      }

      const [upvotes, downvotes] = await Promise.all([
        databases.listDocuments(db, voteCollection, [
          Query.equal("type", type),
          Query.equal("typeId", typeId),
          Query.equal("voteStatus", "upvoted"),
          Query.equal("votedById", votedById),
          Query.limit(1), // for optimizationas we only need total
        ]),
        databases.listDocuments(db, voteCollection, [
          Query.equal("type", type),
          Query.equal("typeId", typeId),
          Query.equal("voteStatus", "downvoted"),
          Query.equal("votedById", votedById),
          Query.limit(1), // for optimizationas we only need total
        ]),
      ])

      return NextResponse.json(
        {
          data: { document: doc, voteResult: upvotes.total - downvotes.total },
          message: response.documents[0] ? "Vote status updated" : "voted",
        },
        {
          status: 201,
        }
      )
    }
    const [upvotes, downvotes] = await Promise.all([
      databases.listDocuments(db, voteCollection, [
        Query.equal("type", type),
        Query.equal("typeId", typeId),
        Query.equal("voteStatus", "upvoted"),
        Query.equal("votedById", votedById),
        Query.limit(1), // for optimizationas we only need total
      ]),
      databases.listDocuments(db, voteCollection, [
        Query.equal("type", type),
        Query.equal("typeId", typeId),
        Query.equal("voteStatus", "downvoted"),
        Query.equal("votedById", votedById),
        Query.limit(1), // for optimizationas we only need total
      ]),
    ])

    return NextResponse.json(
      {
        data: { document: null, voteResult: upvotes.total - downvotes.total },
        message: "Vote withdrawn",
      },
      {
        status: 201,
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Error deleting answer" },
      { status: error?.status || error?.code || 500 }
    )
  }
}
