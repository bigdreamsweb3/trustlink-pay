import { NextResponse } from "next/server";
import { db } from "../../../../database";

export const dependencies = {
  NextResponse,
  control: db.collection("tsn_receiver_control").doc("cranker"),
};
